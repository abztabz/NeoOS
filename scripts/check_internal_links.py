from pathlib import Path
import re,sys
ROOT=Path(__file__).resolve().parents[1]; errors=0; LINK=re.compile(r'\[[^\]]+\]\(([^)]+)\)')
for md in ROOT.rglob('*.md'):
 for n,line in enumerate(md.read_text().splitlines(),1):
  for m in LINK.finditer(line):
   target=m.group(1).split('#',1)[0].strip()
   if not target or target.startswith(('http://','https://','mailto:')): continue
   p=(md.parent/target).resolve()
   if not p.exists(): print(f'ERROR: {md.relative_to(ROOT)}:{n}: {target}'); errors+=1
if errors: sys.exit(1)
print('Internal link validation passed.')
