// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.0;

import "@chainlink/contracts/src/v0.8/dev/ChainlinkClient.sol";


/**
 * @title PaclasOracleDemo: A demonstration of retrieving off chain data via oracles for PACLAS.
 * @author solace.fi
 */
contract PaclasOracleDemo is ChainlinkClient {
    using Chainlink for Chainlink.Request;

    int256 public loss;

    address private oracle;
    bytes32 private jobId;
    uint256 private fee;

    /**
     * Network: Kovan
     * Oracle: 0x2f90A6D021db21e1B2A077c5a37B3C7E75D15b7e
     * Job ID: ad752d90098243f8a5c91059d3e5616c
     * Fee: 0.1 LINK
     */
    constructor() public {
        setPublicChainlinkToken();
        oracle = 0x2f90A6D021db21e1B2A077c5a37B3C7E75D15b7e;
        jobId = "ad752d90098243f8a5c91059d3e5616c";
        fee = 0.1 * 10 ** 18;
    }

    /**
     * @notice Create a Chainlink request to retrieve API response.
     * @dev Response will be returned to fulfillLoss() a few blocks later.
     * @param _policyId The policy to query.
     * @param _startBlock The start block to query.
     * @param _endBlock The end block to query.
     */
    function requestLoss(uint256 _policyId, uint256 _startBlock, uint256 _endBlock) public returns (bytes32 requestId) {
        // require(_policyId < numPolicies, "policy does not exist");
        // policy = getPolicy(_policyId);
        // require(policy.holder == msg.sender, "not your policy");
        // require(_startBlock >= policy.startBlock && _endBlock <= block.number, "invalid window");

        // create the url
        string memory url = string(abi.encodePacked(
            "https://solace-api.aleonard.dev/losses/",
            uintToString(_policyId),
            "/",
            uintToString(_startBlock),
            "/",
            uintToString(_endBlock)
        ));
        // create the request
        Chainlink.Request memory request = buildChainlinkRequest(jobId, address(this), this.fulfillLoss.selector);
        request.add("get", url);
        // Sends the request
        return sendChainlinkRequestTo(oracle, request, fee);
    }

    /**
     * @notice Receive the response.
     * @param _requestId ID of the request.
     * @param _loss The result of the API call.
     */
    function fulfillLoss(bytes32 _requestId, int256 _loss) public recordChainlinkFulfillment(_requestId) {
        loss = _loss;
    }

    /**
     * @notice Creates a string representation of a number.
     * @param _i The number to convert.
     * @return _str The number as a string.
     */
    function uintToString(uint256 _i) internal pure returns (string memory _str) {
        if (_i == 0) {
            return "0";
        }
        uint256 j = _i;
        uint256 length;
        while (j != 0) {
            length++;
            j /= 10;
        }
        bytes memory bstr = new bytes(length);
        uint256 k = length;
        j = _i;
        while (j != 0) {
            bstr[--k] = bytes1(uint8(48 + j % 10));
            j /= 10;
        }
        _str = string(bstr);
    }
}
