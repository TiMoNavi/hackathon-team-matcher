#!/usr/bin/env python3
"""Guarded fixed N05 upgrade. Back up privately; never restore, seed or delete users."""
import hashlib
import json
from pathlib import Path
import secrets
import sys
import time
import harness as h

VERSIONS = {'matcher-user-profile': '0.10.1', 'matcher-auth': '0.1.1',
            'matcher-recommendation': '0.4.1', 'matcher-event-access': '0.1.0'}

def upgrade():
    config = h.runtime_guard()
    h.database_guard(config)
    h.require(config['modules'] in [h.MODULES, h.N05_MODULES], 'N04 or N05 is required.')
    h.require(h.owned_server() is None and h.port_free(), 'Stop only the owned isolated web server first.')
    folder = h.RUNTIME / 'modules'
    names = {p.name for p in folder.iterdir()}
    h.require(set(h.MODULES).issubset(names) and names.issubset(set(h.N05_MODULES)), 'Unexpected module tree.')
    for name in h.N05_MODULES:
        source = h.BACKEND / 'protected/modules' / name
        target = folder / name
        h.require(source.is_dir() and not source.is_symlink(), 'Fixed source unavailable.')
        if target.exists() or target.is_symlink():
            h.require(target.is_symlink() and target.resolve(strict=True) == source.resolve(strict=True), 'Source link mismatch.')
        else:
            h.require(name == 'matcher-event-access', 'Required old source link missing.')
    for name, version in VERSIONS.items():
        metadata = json.loads((h.BACKEND / 'protected/modules' / name / 'module.json').read_text())
        h.require(metadata.get('version') == version, 'Reviewed source version changed.')
    before = h.control('inspect')
    snapshot = h.dump_database()
    h.validate_dump(snapshot)
    digest = hashlib.sha256(snapshot.encode()).hexdigest()
    stamp = 'n05-before-' + time.strftime('%Y%m%dT%H%M%SZ', time.gmtime()) + '-' + secrets.token_hex(4)
    backup = h.RUNTIME / 'backups' / stamp
    backup.mkdir(mode=0o700)
    h.write_private(backup / 'database.sql', snapshot)
    h.write_private(backup / 'manifest.json', json.dumps({'database': h.DB, 'spec': h.SPEC, 'sha256': digest, 'kind': 'backup-only'}))
    h.require(hashlib.sha256((backup / 'database.sql').read_bytes()).hexdigest() == digest, 'Private backup check failed.')
    link = folder / 'matcher-event-access'
    if not link.is_symlink():
        link.symlink_to(h.BACKEND / 'protected/modules/matcher-event-access', target_is_directory=True)
    changed = config['modules'] != h.N05_MODULES
    if changed:
        replacement = {**config, 'modules': list(h.N05_MODULES)}
        h.validate_config(replacement)
        h.replace_private(h.RUNTIME / 'private.json', json.dumps(replacement))
    after = h.control('upgrade-n05')
    for key in ['user', 'profile', 'space', 'space_membership', 'user_auth', 'message', 'message_entry',
                'matcher_profile_draft', 'matcher_profile_attribute', 'matcher_onboarding_session', 'matcher_idea']:
        h.require(before['counts'][key] == after['counts'][key], 'Upgrade changed existing business counts.')
    h.require(before.get('authentication_evidence') == after.get('authentication_evidence'), 'Authentication/source aggregate changed.')
    for name, version in VERSIONS.items():
        h.require(after['modules'][name]['installed_version'] == version, 'Reviewed module version not installed.')
    return {'status': 'passed', 'action': 'upgrade-n05', 'database': h.DB, 'configuration_upgraded': changed,
            'versions': VERSIONS, 'before_counts': before['counts'], 'after_counts': after['counts'],
            'backup_sha256': digest, 'backup_verified': True, 'restored': False, 'seeded_users': False,
            'existing_auth_and_source_aggregates_preserved': True, 'external_calls': 0}

if __name__ == '__main__':
    try:
        with h.locked():
            result = upgrade()
        print(json.dumps(result, indent=2))
    except Exception as error:
        print(json.dumps({'status': 'failed', 'reason': str(error) if isinstance(error, h.Refusal) else 'N05 upgrade failed; private diagnostics suppressed.'}), file=sys.stderr)
        sys.exit(1)
