#!/usr/bin/env bash
# Rehearses Anvay against Agora's real testnet AUSD and Instant Settlement pool on a local fork of Monad testnet:
# deploy the escrow, deposit, blocked redirect, relayed claim, cancel, then the recipient cashes out AUSD -> CTK
# (Agora's testnet stand-in for USDC) through the Instant Settlement pair. Spends no real MON.
set -u
A=/e/.foundry/bin/anvil.exe
C=/e/.foundry/bin/cast.exe
T=0xa9012a055bd4e0eDfF8Ce09f960291C09D5322dC    # AUSD (Agora, Monad testnet)
PAIR=0x1Aa8958Aa34cEC8096EF4381cb335effe977b0ae # Instant Settlement CTK/AUSD pair
WL=0x7c10F56d6f04a51376393a1C3670e966863F6BD5   # testnet self-service whitelister
CTK=0x7BEb5D9DB0d85cBEa543C04f0dE8c23c2176cd9D
HOLDER=${AUSD_HOLDER:-0x1Ba53dFA2753ac30Db6bE2f84495F1541436CB47}   # any testnet AUSD holder
R=http://127.0.0.1:8548
DIR=$(mktemp -d)

$A --fork-url https://testnet-rpc.monad.xyz --port 8548 --silent > "$DIR/anvil.log" 2>&1 &
APID=$!
trap 'kill $APID 2>/dev/null; taskkill //F //IM anvil.exe >/dev/null 2>&1' EXIT
for _ in $(seq 1 30); do $C chain-id --rpc-url $R >/dev/null 2>&1 && break; sleep 1; done

newkey() { $C wallet new --json | python -c "import sys,json;d=json.load(sys.stdin)['data'][0];sys.stdout.write(d['private_key']+' '+d['address']+chr(10))" | tr -d '\015'; }
MN="test test test test test test test test test test test junk"
SPK=$($C wallet private-key "$MN" 0); S=$($C wallet address --private-key "$SPK")
RPK=$($C wallet private-key "$MN" 1); RL=$($C wallet address --private-key "$RPK")
read -r LPK LK < <(newkey)
read -r RPK2 REC < <(newkey)
EXP=$(( $(date +%s) + 7*86400 ))
bal() { $C call "$1" "balanceOf(address)(uint256)" "$2" --rpc-url $R | cut -d' ' -f1; }
tx() { $C send "$@" --rpc-url $R --json 2>&1 | python -c "import sys,json
try: print('ok' if json.load(sys.stdin)['status'] in ('0x1',1,'1') else 'FAILED')
except Exception: print('REVERTED')"; }

E=$(cd "$(dirname "$0")/.." && /e/.foundry/bin/forge.exe create src/ClaimLinkEscrow.sol:ClaimLinkEscrow --rpc-url $R --private-key $SPK --broadcast --json --constructor-args $T 2>/dev/null | python -c "import sys,json;print(json.load(sys.stdin)['deployedTo'])" | tr -d '\015')
echo "0. escrow deployed with real AUSD:  $E (token $($C call $E 'token()(address)' --rpc-url $R))"
$C rpc anvil_impersonateAccount $HOLDER --rpc-url $R >/dev/null
$C rpc anvil_setBalance $HOLDER 0x56BC75E2D63100000 --rpc-url $R >/dev/null
echo "1. fund sender 100 AUSD:            $(tx $T 'transfer(address,uint256)' $S 100000000 --from $HOLDER --unlocked)"
echo "2. approve escrow:                  $(tx $T 'approve(address,uint256)' $E 100000000 --private-key $SPK)"
echo "3. deposit 25 AUSD:                 $(tx $E 'deposit(uint96,address,uint64)' 25000000 $LK $EXP --private-key $SPK)"
ID=$($C call $E "transferCount()(uint256)" --rpc-url $R)
SIG=$($C wallet sign --no-hash "$($C call $E 'claimDigest(uint256,address)(bytes32)' $ID $REC --rpc-url $R)" --private-key $LPK)
echo "4. relayer redirects to itself:     $(tx $E 'claim(uint256,address,bytes)' $ID $RL $SIG --private-key $RPK)   (expected REVERTED)"
echo "5. relayer claims for recipient:    $(tx $E 'claim(uint256,address,bytes)' $ID $REC $SIG --private-key $RPK)"
echo "   recipient AUSD=$(bal $T $REC) (expect 25000000)"
echo "6. deposit 10 AUSD, sender cancels: $(tx $E 'deposit(uint96,address,uint64)' 10000000 $LK $EXP --private-key $SPK) / $(tx $E 'cancel(uint256)' $((ID+1)) --private-key $SPK)"
echo "   sender AUSD=$(bal $T $S) (expect 75000000)  escrow AUSD=$(bal $T $E) (expect 0)"
$C rpc anvil_setBalance $REC 0x16345785D8A0000 --rpc-url $R >/dev/null
echo "7. recipient self-whitelists:       $(tx $WL 'setApprovedSwapper(address)' $REC --private-key $RPK2)"
echo "8. recipient approves pair:         $(tx $T 'approve(address,uint256)' $PAIR 25000000 --private-key $RPK2)"
DL=$(( $(date +%s) + 600 ))
echo "9. swap 25 AUSD -> CTK (cash out):  $(tx $PAIR 'swapExactTokensForTokens(uint256,uint256,address[],address,uint256)' 25000000 0 "[$T,$CTK]" $REC $DL --private-key $RPK2)"
echo "   recipient AUSD=$(bal $T $REC) (expect 0)  CTK=$(bal $CTK $REC) (expect ~25e18)"
