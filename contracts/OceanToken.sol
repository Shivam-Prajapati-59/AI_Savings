// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract OceanToken is ERC20 {
    constructor() ERC20("Ocean Token", "OCT") {
        _mint(msg.sender, 1_000_000 * 10 ** decimals());
    }
}
