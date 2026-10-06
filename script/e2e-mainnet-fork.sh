#!/usr/bin/env bash
# Prove ClaimLinkEscrow works with Agora's REAL AUSD, without spending anything:
# fork Monad mainnet locally with anvil, deploy the escrow against the real AUSD contract,
# borrow 100 AUSD from an existing holder (impersonation only exists on the local fork),
# then run deposit -> relayed claim -> cancel. Nothing is sent to the real network.
set -u
A=/e/.foundry/bin/anvil.exe
C=/e/.foundry/bin/cast.exe
F=/e/.foundry/bin/forge.exe
AUSD=0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a
# Known AUSD holders on mainnet; the first one with >= 100 AUSD at fork time is used. Override with AUSD_HOLDER.
CANDIDATES="${AUSD_HOLDER:-} 0xba3d60f5000f472aef947fb8020a3e6319f9a0b7 0xd5b70d70cbe6c42bcd1aaa662a21673a83f4615b 0xf4db2e9d49817ee4d1b89c214a0dd76b603f9c33"
R=http://127.0.0.1:8549
cd "$(dirname "$0")/.."

$A --fork-url https://rpc.monad.xyz --port 8549 --silent > /dev/null 2>&1 &
APID=$!
trap 'kill $APID 2>/dev/null; taskkill //F //IM anvil.exe >/dev/null 2>&1' EXIT
for _ in $(seq 1 60); do $C chain-id --rpc-url $R >/dev/null 2>&1 && break; sleep 1; done
echo "forked chain id: $($C chain-id --rpc-url $R) (143 = Monad mainnet), block $($C block-number --rpc-url $R)"

newkey() { $C wallet new --json | python -c "import sys,json;d=json.load(sys.stdin)['data'][0];sys.stdout.write(d['private_key']+' '+d['address']+chr(10))" | tr -d '\015'; }
MN="test test test test test test test test test test test junk"   # anvil's public dev accounts
SPK=$($C wallet private-key "$MN" 0); S=$($C wallet address --private-key "$SPK")
RPK=$($C wallet private-key "$MN" 1); RL=$($C wallet address --private-key "$RPK")
read -r LPK LK < <(newkey)
read -r _ REC < <(newkey)
bal() { $C call $AUSD "balanceOf(address)(uint256)" "$1" --rpc-url $R | cut -d' ' -f1; }
tx() { $C send "$@" --rpc-url $R --json 2>&1 | python -c "import sys,json
try: print('ok' if json.load(sys.stdin)['status'] in ('0x1',1,'1') else 'FAILED')
except Exception: print('REVERTED')"; }

# --constructor-args is variadic, so it must come last.
E=$($F create src/ClaimLinkEscrow.sol:ClaimLinkEscrow --private-key $SPK --rpc-url $R --broadcast --constructor-args $AUSD 2>&1 | grep -oE 'Deployed to: 0x[0-9a-fA-F]{40}' | awk '{print $3}')
echo "escrow deployed on fork at $E, token() = $($C call $E 'token()(address)' --rpc-url $R)"

HOLDER=""
for h in $CANDIDATES; do [ "$(bal $h)" -ge 100000000 ] 2>/dev/null && HOLDER=$h && break; done
[ -z "$HOLDER" ] && echo "No candidate holder has 100 AUSD right now; set AUSD_HOLDER to one that does." && exit 1
echo "borrowing from AUSD holder $HOLDER (balance $(bal $HOLDER)), on the fork only"
$C rpc anvil_impersonateAccount $HOLDER --rpc-url $R >/dev/null
$C rpc anvil_setBalance $HOLDER 0xDE0B6B3A7640000 --rpc-url $R >/dev/null   # 1 MON for gas, fork only
echo "1. holder sends 100 real AUSD to sender: $(tx $AUSD 'transfer(address,uint256)' $S 100000000 --from $HOLDER --unlocked)"
echo "   sender AUSD=$(bal $S)"
EXP=$(( $(date +%s) + 7*86400 ))
echo "2. approve escrow:                       $(tx $AUSD 'approve(address,uint256)' $E 100000000 --private-key $SPK)"
echo "3. deposit 25 AUSD behind a link key:    $(tx $E 'deposit(uint96,address,uint64)' 25000000 $LK $EXP --private-key $SPK)"
ID=$($C call $E "transferCount()(uint256)" --rpc-url $R | cut -d' ' -f1)
SIG=$($C wallet sign --no-hash "$($C call $E 'claimDigest(uint256,address)(bytes32)' $ID $REC --rpc-url $R)" --private-key $LPK | tr -d '\015')
echo "4. relayer redirects to itself:          $(tx $E 'claim(uint256,address,bytes)' $ID $RL $SIG --private-key $RPK)   (expected REVERTED)"
echo "5. relayer claims for recipient:         $(tx $E 'claim(uint256,address,bytes)' $ID $REC $SIG --private-key $RPK)"
echo "   recipient AUSD=$(bal $REC) (expect 25000000)  recipient MON=$($C balance $REC --rpc-url $R)"
echo "6. deposit 10 AUSD, then sender cancels: $(tx $E 'deposit(uint96,address,uint64)' 10000000 $LK $EXP --private-key $SPK) / $(tx $E 'cancel(uint256)' $((ID + 1)) --private-key $SPK)"
echo "   sender AUSD=$(bal $S) (expect 75000000)  escrow AUSD=$(bal $E) (expect 0)"
