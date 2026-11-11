<?php
declare(strict_types=1);
namespace humhub\modules\matcherWebImport\domain;

use humhub\modules\matcherProfile\domain\ProfileException;

/** Conservative public unicast allow policy. All DNS answers must pass. */
final class PublicAddressPolicy
{
    public static function assertPublic(string $address): void
    {
        $binary = @inet_pton($address);
        if ($binary === false) { self::reject(); }
        if (strlen($binary) === 4) {
            foreach (['0.0.0.0/8','10.0.0.0/8','100.64.0.0/10','127.0.0.0/8','169.254.0.0/16','172.16.0.0/12','192.0.0.0/24','192.0.2.0/24','192.88.99.0/24','192.168.0.0/16','198.18.0.0/15','198.51.100.0/24','203.0.113.0/24','224.0.0.0/4','240.0.0.0/4'] as $cidr) {
                if (self::inCidr($binary, $cidr)) { self::reject(); }
            }
            return;
        }
        // Excludes unspecified, loopback, mapped IPv4, NAT64, ULA, link-local and multicast.
        if (!self::inCidr($binary, '2000::/3')) { self::reject(); }
        foreach (['2001::/23','2001:db8::/32','2002::/16','3fff::/20'] as $cidr) {
            if (self::inCidr($binary, $cidr)) { self::reject(); }
        }
    }

    private static function inCidr(string $binary, string $cidr): bool
    {
        [$prefix, $bits] = explode('/', $cidr); $network = inet_pton($prefix); $bits = (int)$bits;
        if (strlen($binary) !== strlen($network)) { return false; }
        $bytes = intdiv($bits, 8); $remainder = $bits % 8;
        return substr($binary, 0, $bytes) === substr($network, 0, $bytes)
            && ($remainder === 0 || ((ord($binary[$bytes]) ^ ord($network[$bytes])) & (255 << (8 - $remainder))) === 0);
    }

    private static function reject(): never
    {
        throw new ProfileException('WEB_TARGET_NOT_PUBLIC', 'Only publicly reachable website addresses are supported.');
    }
}
