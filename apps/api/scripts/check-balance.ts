import { createPublicClient, http, formatEther, parseAbi } from "viem";
import "dotenv/config";

const abi = parseAbi(["function balanceOf(address) view returns (uint256)"]);
const client = createPublicClient({ transport: http("https://testnet-rpc.monad.xyz") });

const pool = process.env.PAYMENT_POOL_ADDRESS!;
const user = "0xdC97A0631c100D514A2b45a7d2252570c6eFdf22";

console.log("Pool contract:", pool);
console.log("User wallet:", user);

const bal = await client.readContract({
  address: pool as `0x${string}`,
  abi,
  functionName: "balanceOf",
  args: [user],
});
console.log("Pool balance:", formatEther(bal), "MON");

const native = await client.getBalance({ address: user });
console.log("Native balance:", formatEther(native), "MON");
