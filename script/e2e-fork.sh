#!/usr/bin/env bash
# End-to-end check of the deployed testnet contracts on a local anvil fork (spends no real MON).
set -u
A=/e/.foundry/bin/anvil.exe
C=/e/.foundry/bin/cast.exe
T=0x73E297c20cdee9291D09A66563C78939E5CA9aB5   # MockAUSD (testnet)
E=0x607B0075fd9602820AA9Ef4395D7b32657a10cDa   # ClaimLinkEscrow (testnet)
R=http://127.0.0.1:8547
DIR=$(mktemp -d)

$A --fork-url https://testnet-rpc.monad.xyz --port 8547 --silent > "$DIR/anvil.log" 2>&1 &
APID=$!
trap 'kill $APID 2>/dev/null; taskkill //F //IM anvil.exe >/dev/null 2>&1' EXIT
for _ in $(seq 1 30); do $C chain-id --rpc-url $R >/dev/null 2>&1 && break; sleep 1; done

newkey() { $C wallet new --json | python -c "import sys,json;d=json.load(sys.stdin)['data'][0];sys.stdout.write(d['private_key']+' '+d['address']+chr(10))" | tr -d '\015'; }

# Anvil's public dev mnemonic: account 0 = sender, account 1 = relayer.
MN="test test test test test test test test test test test junk"
SPK=$($C wallet private-key "$MN" 0); S=$($C wallet address --private-key "$SPK")
RPK=$($C wallet private-key "$MN" 1); RL=$($C wallet address --private-key "$RPK")
read -r LPK LK < <(newkey)      # one-time link key
read -r _ REC < <(newkey)       # fresh recipient wallet with zero MON
EXP=$(( $(date +%s) + 7*86400 ))
bal() { $C call $T "balanceOf(address)(uint256)" "$1" --rpc-url $R | cut -d' ' -f1; }
tx() { $C send "$@" --rpc-url $R --json 2>&1 | python -c "import sys,json
try: print('ok' if json.load(sys.stdin)['status'] in ('0x1',1,'1') else 'FAILED')
except Exception: print('REVERTED')"; }

echo "1. mint 100 AUSD to sender:        $(tx $T 'mint(address,uint256)' $S 100000000 --private-key $SPK)"
echo "2. approve escrow:                 $(tx $T 'approve(address,uint256)' $E 100000000 --private-key $SPK)"
echo "3. deposit 25 AUSD (link key):     $(tx $E 'deposit(uint96,address,uint64)' 25000000 $LK $EXP --private-key $SPK)"
ID=$($C call $E "transferCount()(uint256)" --rpc-url $R)
SIG=$($C wallet sign --no-hash "$($C call $E 'claimDigest(uint256,address)(bytes32)' $ID $REC --rpc-url $R)" --private-key $LPK)
echo "4. relayer redirects to itself:    $(tx $E 'claim(uint256,address,bytes)' $ID $RL $SIG --private-key $RPK)   (expected REVERTED)"
echo "5. relayer claims for recipient:   $(tx $E 'claim(uint256,address,bytes)' $ID $REC $SIG --private-key $RPK)"
echo "6. same claim again:               $(tx $E 'claim(uint256,address,bytes)' $ID $REC $SIG --private-key $RPK)   (expected REVERTED)"
echo "   recipient AUSD=$(bal $REC)  recipient MON=$($C balance $REC --rpc-url $R)  relayer AUSD=$(bal $RL)"
echo "7. deposit 10 AUSD:                $(tx $E 'deposit(uint96,address,uint64)' 10000000 $LK $EXP --private-key $SPK)"
ID2=$($C call $E "transferCount()(uint256)" --rpc-url $R)
echo "8. relayer cancels sender's:       $(tx $E 'cancel(uint256)' $ID2 --private-key $RPK)   (expected REVERTED)"
echo "9. sender cancels:                 $(tx $E 'cancel(uint256)' $ID2 --private-key $SPK)"
echo "   sender AUSD=$(bal $S) (expect 75000000)  escrow AUSD=$(bal $E) (expect 0)"
