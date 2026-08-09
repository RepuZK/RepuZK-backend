pragma circom 2.0.0;

include "circomlib/circuits/comparators.circom";

// Proves that a private jobs_completed count is >= 100 without revealing
// the exact count. Instantiates the "jobs_completed_gt_N" claim family
// documented in ../README.md for N = 100.
template JobsCompletedGte(threshold) {
    signal input jobs_completed;
    signal output valid;

    // 16 bits covers up to 65,535 completed jobs, far beyond any
    // realistic freelance/contribution count.
    component gte = GreaterEqThan(16);
    gte.in[0] <== jobs_completed;
    gte.in[1] <== threshold;
    valid <== gte.out;

    valid === 1;
}

component main = JobsCompletedGte(100);
