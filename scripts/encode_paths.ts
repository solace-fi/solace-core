import { FeeAmount } from "./../test/utilities/uniswap";
import { encodePath } from "./../test/utilities/path";

const WETH_ADDRESS = "0x9273113C307f2f795C6d4D25c436d85435c73f9f";
const SOLACE_ADDRESS = "0x44B843794416911630e74bAB05021458122c40A0";

console.log("WETH->SOLACE medium fee");
console.log(encodePath([WETH_ADDRESS, SOLACE_ADDRESS], [FeeAmount.MEDIUM]));
// 0x9273113c307f2f795c6d4d25c436d85435c73f9f000bb844b843794416911630e74bab05021458122c40a0
