#!/usr/bin/env bash
# Compiles every circuit in circuits-src/ into the .wasm + .zkey pair that
# ProofService loads at runtime from src/proof/circuits/<circuitName>.{wasm,zkey}.
#
# Requires:
#   - circom 2.x on PATH (https://docs.circom.io/getting-started/installation)
#   - `npm install` already run in this repo (circomlib + snarkjs come from node_modules)
#
# Usage:
#   ./scripts/compile-circuits.sh                # compile every circuit in circuits-src/
#   ./scripts/compile-circuits.sh success_rate_gt_95   # compile just one

set -euo pipefail
cd "$(dirname "$0")/.."

SRC_DIR="circuits-src"
BUILD_DIR="circuits-build"
OUT_DIR="src/proof/circuits"
PTAU="$BUILD_DIR/pot12_final.ptau"

mkdir -p "$BUILD_DIR" "$OUT_DIR"

if [ ! -f "$PTAU" ]; then
  echo "== Powers of Tau ceremony (one-time, shared by every circuit) =="
  npx snarkjs powersoftau new bn128 12 "$BUILD_DIR/pot12_0000.ptau" -v
  npx snarkjs powersoftau contribute "$BUILD_DIR/pot12_0000.ptau" "$BUILD_DIR/pot12_0001.ptau" \
    --name="RepuZK contribution" -v -e="$(head -c 64 /dev/urandom | base64)"
  npx snarkjs powersoftau prepare phase2 "$BUILD_DIR/pot12_0001.ptau" "$PTAU" -v
fi

CIRCUITS="${*:-$(cd "$SRC_DIR" && ls *.circom | sed 's/\.circom$//')}"

for name in $CIRCUITS; do
  echo "== Compiling $name =="
  circom "$SRC_DIR/$name.circom" --r1cs --wasm --sym -l node_modules -o "$BUILD_DIR"

  echo "== Groth16 phase 2 setup: $name =="
  npx snarkjs groth16 setup "$BUILD_DIR/$name.r1cs" "$PTAU" "$BUILD_DIR/${name}_0000.zkey"
  npx snarkjs zkey contribute "$BUILD_DIR/${name}_0000.zkey" "$BUILD_DIR/$name.zkey" \
    --name="RepuZK contributor" -v -e="$(head -c 64 /dev/urandom | base64)"
  npx snarkjs zkey export verificationkey "$BUILD_DIR/$name.zkey" "$BUILD_DIR/${name}_verification_key.json"

  cp "$BUILD_DIR/${name}_js/$name.wasm" "$OUT_DIR/$name.wasm"
  cp "$BUILD_DIR/$name.zkey" "$OUT_DIR/$name.zkey"
  echo "== $name.wasm + $name.zkey written to $OUT_DIR =="
done

echo "Done. Compiled circuits: $CIRCUITS"
