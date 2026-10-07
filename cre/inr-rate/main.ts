/**
 * Anvay INR rate workflow (Chainlink CRE).
 *
 * Every run, each node fetches USD->INR from three independent public sources and takes their median. The nodes then
 * agree on the median of their answers (DON consensus), and the result is written to InrRateFeed on Monad through the
 * Chainlink forwarder. Anvay shows rupee amounts from that on-chain rate.
 *
 * Report payload: abi.encode(uint256 inrPerUsdE6, uint64 observedAt)
 */
import {
	type CronPayload,
	CronCapability,
	consensusMedianAggregation,
	EVMClient,
	getNetwork,
	HTTPClient,
	type HTTPSendRequester,
	handler,
	ok,
	prepareReportRequest,
	Runner,
	type Runtime,
	TxStatus,
	text,
} from '@chainlink/cre-sdk'
import { encodeAbiParameters } from 'viem'
import { z } from 'zod'

const configSchema = z.object({
	schedule: z.string(),
	evm: z.object({
		chainSelectorName: z.string(),
		rateFeedAddress: z.string(),
		gasLimit: z.string(),
	}),
})

type Config = z.infer<typeof configSchema>

/** Public USD->INR sources that need no API key. Each entry knows how to pull INR out of its JSON. */
const SOURCES: { name: string; url: string; pick: (json: any) => unknown }[] = [
	{ name: 'open.er-api', url: 'https://open.er-api.com/v6/latest/USD', pick: (j) => j?.rates?.INR },
	{ name: 'frankfurter (ECB)', url: 'https://api.frankfurter.dev/v1/latest?base=USD&symbols=INR', pick: (j) => j?.rates?.INR },
	{
		name: 'fawazahmed0 currency-api',
		url: 'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json',
		pick: (j) => j?.usd?.inr,
	},
]

const MIN_SOURCES = 2

const median = (values: number[]) => {
	const sorted = [...values].sort((a, b) => a - b)
	const mid = Math.floor(sorted.length / 2)
	return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

/** Runs on each node: query every source, keep plausible answers, return their median. */
const fetchInrRate = (sendRequester: HTTPSendRequester) => {
	const rates: number[] = []
	for (const source of SOURCES) {
		try {
			const response = sendRequester.sendRequest({ url: source.url, method: 'GET' }).result()
			if (!ok(response)) continue
			const rate = Number(source.pick(JSON.parse(text(response))))
			if (Number.isFinite(rate) && rate > 10 && rate < 1000) rates.push(rate)
		} catch {
			// one failing source must not fail the node; MIN_SOURCES guards the result
		}
	}
	if (rates.length < MIN_SOURCES) {
		throw new Error(`only ${rates.length} of ${SOURCES.length} rate sources answered`)
	}
	return median(rates)
}

const onCronTrigger = (runtime: Runtime<Config>, payload: CronPayload) => {
	const rate = new HTTPClient().sendRequest(runtime, fetchInrRate, consensusMedianAggregation())().result()
	const inrPerUsdE6 = BigInt(Math.round(rate * 1_000_000))

	// All nodes use the trigger's scheduled time, so the report is identical across the DON.
	const scheduled = payload.scheduledExecutionTime?.seconds
	const observedAt = scheduled !== undefined ? BigInt(scheduled) : BigInt(Math.floor(runtime.now().getTime() / 1000))
	runtime.log(`USD/INR consensus rate ${rate} (observed ${observedAt})`)

	const network = getNetwork({ chainFamily: 'evm', chainSelectorName: runtime.config.evm.chainSelectorName, isTestnet: true })
	if (!network) throw new Error(`unknown chain ${runtime.config.evm.chainSelectorName}`)

	const reportPayload = encodeAbiParameters(
		[{ type: 'uint256' }, { type: 'uint64' }],
		[inrPerUsdE6, observedAt],
	)
	const report = runtime.report(prepareReportRequest(reportPayload)).result()

	const reply = new EVMClient(network.chainSelector.selector)
		.writeReport(runtime, {
			receiver: runtime.config.evm.rateFeedAddress,
			report,
			gasConfig: { gasLimit: runtime.config.evm.gasLimit },
		})
		.result()

	if (reply.txStatus !== TxStatus.SUCCESS) {
		throw new Error(`writing the rate failed: ${reply.errorMessage || reply.txStatus}`)
	}
	runtime.log(`rate written on-chain`)
	return { inrPerUsdE6: inrPerUsdE6.toString(), observedAt: observedAt.toString() }
}

const initWorkflow = (config: Config) => [
	handler(new CronCapability().trigger({ schedule: config.schedule }), onCronTrigger),
]

export async function main() {
	const runner = await Runner.newRunner<Config>({ configSchema })
	await runner.run(initWorkflow)
}
