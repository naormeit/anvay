#!/usr/bin/env bash
# Exercise /api/faucet and /api/claim against a local anvil fork of Monad testnet.
set -u
A=/e/.foundry/bin/anvil.exe
C=/e/.foundry/bin/cast.exe
T=0x73E297c20cdee9291D09A66563C78939E5CA9aB5
E=0x607B0075fd9602820AA9Ef4395D7b32657a10cDa
RELAYER=0x1Ba53dFA2753ac30Db6bE2f84495F1541436CB47
R=http://127.0.0.1:8548
APP=http://127.0.0.1:3100
LOG=$(mktemp -d)

cleanup() {
  for port in 8548 3100; do
    pid=$(netstat -ano | grep -E "127.0.0.1:$port |0.0.0.0:$port |\[::\]:$port " | grep LISTENING | awk '{print $NF}' | head -1)
    [ -n "$pid" ] && taskkill //F //T //PID "$pid" >/dev/null 2>&1
  done
}
trap cleanup EXIT

$A --fork-url https://testnet-rpc.monad.xyz --port 8548 --silent > "$LOG/anvil.log" 2>&1 &
for _ in $(seq 1 30); do $C chain-id --rpc-url $R >/dev/null 2>&1 && break; sleep 1; done
$C rpc anvil_setBalance $RELAYER 0x8AC7230489E80000 --rpc-url $R >/dev/null   # 10 MON for the fork only

(cd /e/monad/metropolis/app && NEXT_PUBLIC_RPC_URL=$R npx next dev -p 3100 > "$LOG/next.log" 2>&1 &)
for _ in $(seq 1 90); do curl -s -o /dev/null "$APP/claim" && break; sleep 1; done

newkey() { $C wallet new --json | python -c "import sys,json;d=json.load(sys.stdin)['data'][0];sys.stdout.write(d['private_key']+' '+d['address']+chr(10))" | tr -d '\015'; }
read -r UPK U < <(newkey)    # sender (fresh, no funds)
read -r LPK L < <(newkey)    # link key
read -r _ REC < <(newkey)    # recipient (fresh, no funds)
read -r _ ATK < <(newkey)    # attacker
bal() { $C call $T "balanceOf(address)(uint256)" "$1" --rpc-url $R | cut -d' ' -f1; }
post() { curl -s -w ' [HTTP %{http_code}]' -X POST "$APP$1" -H 'Content-Type: application/json' -d "$2"; echo; }

echo "1. faucet for new sender:     $(post /api/faucet "{\"address\":\"$U\"}")"
echo "   sender AUSD=$(bal $U)  MON=$($C balance $U --ether --rpc-url $R)"
echo "2. faucet again (cooldown):   $(post /api/faucet "{\"address\":\"$U\"}")"
echo "3. faucet bad address:        $(post /api/faucet '{"address":"nope"}')"

$C send $T "approve(address,uint256)" $E 25000000 --private-key $UPK --rpc-url $R >/dev/null
$C send $E "deposit(uint96,address,uint64)" 25000000 $L $(( $(date +%s) + 86400 )) --private-key $UPK --rpc-url $R >/dev/null
ID=$($C call $E "transferCount()(uint256)" --rpc-url $R | cut -d' ' -f1)
echo "4. sender deposited 25 AUSD as transfer #$ID"

SIG=$($C wallet sign --no-hash "$($C call $E 'claimDigest(uint256,address)(bytes32)' $ID $REC --rpc-url $R)" --private-key $LPK | tr -d '\015')
echo "5. claim, attacker address:   $(post /api/claim "{\"id\":\"$ID\",\"recipient\":\"$ATK\",\"signature\":\"$SIG\"}")"
echo "6. claim, malformed body:     $(post /api/claim '{"id":"x"}')"
echo "7. claim for recipient:       $(post /api/claim "{\"id\":\"$ID\",\"recipient\":\"$REC\",\"signature\":\"$SIG\"}")"
echo "   recipient AUSD=$(bal $REC)  recipient MON=$($C balance $REC --rpc-url $R)  attacker AUSD=$(bal $ATK)"
echo "8. same claim again:          $(post /api/claim "{\"id\":\"$ID\",\"recipient\":\"$REC\",\"signature\":\"$SIG\"}")"
echo "9. pages:  /=$(curl -s -o /dev/null -w '%{http_code}' $APP/)  /claim=$(curl -s -o /dev/null -w '%{http_code}' $APP/claim)"
echo "--- server errors:"; grep -iE "error|failed" "$LOG/next.log" | grep -v "claim failed\|faucet failed" | head -5
