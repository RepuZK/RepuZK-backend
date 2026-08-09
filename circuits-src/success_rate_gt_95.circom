pragma circom 2.0.0;

include "circomlib/circuits/comparators.circom";

// Proves that a private success_rate (0-100) is >= 95 without revealing
// the exact value. Instantiates the "success_rate_gt_N" claim family
// documented in ../README.md for N = 95.
//
// Witness generation fails (no proof can be produced) unless the private
// success_rate actually satisfies the threshold — that's what makes this
// a real zero-knowledge proof of the claim rather than a rubber stamp.
template SuccessRateGte(threshold) {
    signal input success_rate;
    signal output valid;

    // success_rate is a 0-100 percentage; 7 bits comfortably covers the
    // range GreaterEqThan needs to stay sound.
    component gte = GreaterEqThan(7);
    gte.in[0] <== success_rate;
    gte.in[1] <== threshold;
    valid <== gte.out;

    valid === 1;
}

component main = SuccessRateGte(95);
