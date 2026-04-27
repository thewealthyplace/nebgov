import { hashDescription } from "@nebgov/sdk";

/**
 * Resolves metadata from IPFS or HTTPS URIs.
 * For IPFS, uses the Public Gateway defined in NEXT_PUBLIC_IPFS_GATEWAY.
 */
export async function fetchProposalMetadata(uri: string): Promise<string> {
    let url = uri;
    if (uri.startsWith("ipfs://")) {
        const gateway = process.env.NEXT_PUBLIC_IPFS_GATEWAY || "https://ipfs.io/ipfs/";
        url = `${gateway}${uri.replace("ipfs://", "")}`;
    }

    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Failed to fetch metadata from ${url}: ${response.statusText}`);
    }
    return response.text();
}

/**
 * Verifies that the fetched content matches the on-chain SHA-256 hash.
 */
export async function verifyMetadataHash(content: string, expectedHash: string): Promise<boolean> {
    const computedHash = await hashDescription(content);
    return computedHash.toLowerCase() === expectedHash.toLowerCase();
}
