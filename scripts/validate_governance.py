from __future__ import annotations
import json,re,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
REQUIRED=['LICENSE','CONTRIBUTING.md','CODE_OF_CONDUCT.md','SECURITY.md','CODEOWNERS','README.md','CHANGELOG.md','docs/constitution/NEOOS_CONSTITUTION.md','docs/core-principles/CORE_PRINCIPLES.md','docs/governance/GOVERNANCE_MANUAL.md','docs/governance/records/README.md','docs/standards/VERSIONING_POLICY.md','docs/status/GOVERNANCE_STATUS_REGISTRY.md','neoos-governance-pack.json']
VALID={'Proposed','Accepted','Rejected','Superseded','Archived'}; NAME=re.compile(r'^(\d{4})-[a-z0-9][a-z0-9-]*\.md$'); SEMVER=re.compile(r'^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$'); errors=0
def fail(x):
 global errors; print('ERROR:',x); errors+=1
for r in REQUIRED:
 if not (ROOT/r).is_file(): fail('Required file missing: '+r)
try: m=json.loads((ROOT/'neoos-governance-pack.json').read_text())
except Exception as e: fail('Invalid package JSON: '+str(e)); m={}
if not SEMVER.match(str(m.get('version',''))): fail('Package version is not SemVer')
seen=set(); d=ROOT/'docs/governance/records'
for p in sorted(d.glob('*.md')):
 if p.name=='README.md': continue
 ma=NAME.match(p.name)
 if not ma: fail('Invalid GDR filename: '+p.name); continue
 if ma.group(1) in seen: fail('Duplicate GDR number: '+ma.group(1))
 seen.add(ma.group(1)); t=p.read_text()
 for field in ['Decision status','Date','Version introduced','Authority path','Context','Decision','Alternatives considered','Consequences']:
  if field not in t: fail(f'{p.name} missing {field}')
 sm=re.search(r'\*\*Decision status:\*\*\s*([A-Za-z ]+)',t)
 if not sm or sm.group(1).strip() not in VALID: fail(p.name+' invalid decision status')
if errors: sys.exit(1)
print('Governance validation passed.')
