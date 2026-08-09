pragma circom 2.0.0;

include "circomlib/circuits/comparators.circom";

// Proves that a private disputes count equals exactly 0 without revealing
// any other transaction history. Instantiates the "disputes_zero" claim
// documented in ../README.md.
template DisputesZero() {
    signal input disputes;
    signal output valid;

    component isz = IsZero();
    isz.in <== disputes;
    valid <== isz.out;

    valid === 1;
}

component main = DisputesZero();
