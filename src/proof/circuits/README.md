# ZK Circuits

Place compiled Circom/SnarkJS circuit files here. Each circuit requires two files:
- `<circuit_name>.wasm`   — compiled witness generator
- `<circuit_name>.zkey`   — proving key (phase 2 trusted setup)

## Supported circuits

| Circuit name           | Claim proved              |
|------------------------|---------------------------|
| success_rate_gt_N      | success_rate >= N         |
| jobs_completed_gt_N    | jobs_completed >= N       |
| score_gt_N             | reputation_score >= N     |
| disputes_zero          | disputes === 0            |
| votes_gt_N             | governance_votes >= N     |
| gpa_gt_N               | gpa >= N * 10             |

## Build circuits

```bash
# Example: success_rate_gt_95
circom success_rate_gt_95.circom --r1cs --wasm --sym
snarkjs groth16 setup success_rate_gt_95.r1cs pot12_final.ptau success_rate_gt_95_0000.zkey
snarkjs zkey contribute success_rate_gt_95_0000.zkey success_rate_gt_95.zkey --name="contributor"
snarkjs zkey export verificationkey success_rate_gt_95.zkey verification_key.json
```

Copy the resulting `.wasm` and `.zkey` files into this directory.
