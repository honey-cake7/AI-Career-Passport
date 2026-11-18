import { setServers } from 'node:dns';
import { isIP } from 'node:net';

/** Opt-in for broken SRV/TXT resolution (for example, a local VPN resolver).
 * Changes Node's DNS resolver only, never the operating system or database URI. */
export function configureDnsServers(value = process.env.DNS_SERVERS, apply = setServers): void {
  if (!value?.trim()) return;
  const servers = value.split(',').map(server => server.trim());
  if (servers.length > 3 || servers.some(server => !isIP(server))) {
    throw new Error('DNS_SERVERS must contain one to three comma-separated IP addresses');
  }
  apply(servers);
}
