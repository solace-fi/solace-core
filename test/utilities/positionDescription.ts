export function encodeAddresses(addresses: string[]): string {
  let encoded = "0x"
  for (let i = 0; i < addresses.length; i++) {
    var address = addresses[i];
    if(address.length != 42 || address.substring(0,2) != "0x") {
      throw new Error(`invalid address: ${address}`);
    }
    // 20 byte encoding of the address
    encoded += address.slice(2).toLowerCase();
  }
  return encoded;
}
