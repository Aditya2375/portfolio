"""Dependency-free checks for the static portfolio review edition."""
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlsplit
import json
ROOT=Path(__file__).resolve().parents[1]
class Check(HTMLParser):
    def __init__(self): super().__init__(); self.h1=0; self.errors=[]
    def handle_starttag(self,tag,attrs):
        a=dict(attrs)
        if tag=='h1': self.h1+=1
        if tag=='img' and 'alt' not in a:self.errors.append('missing image alt')
        if tag=='script' and not a.get('src'):self.errors.append('inline script')
        if any(k.startswith('on') for k in a):self.errors.append('inline event handler')
        if tag=='a' and a.get('target')=='_blank' and 'noopener' not in a.get('rel',''):self.errors.append('opener access')
        for key in ['href','src']:
            value=a.get(key,'')
            if not value or value.startswith(('#','data:','mailto:')) or urlsplit(value).scheme:continue
            p=ROOT/value.split('#')[0]
            if not p.exists():self.errors.append('missing local resource: '+value)
failures=[]
for path in ROOT.glob('*.html'):
    c=Check();c.feed(path.read_text())
    if c.h1!=1:c.errors.append('expected one h1')
    failures.extend(path.name+': '+e for e in c.errors)
policy=json.loads((ROOT/'vercel.json').read_text())
headers={x['key']:x['value'] for x in policy['headers'][0]['headers']}
assert "script-src 'self'" in headers['Content-Security-Policy']
assert "frame-ancestors 'none'" in headers['Content-Security-Policy']
assert "microphone=()" in headers['Permissions-Policy']
assert 'prefers-reduced-motion' in (ROOT/'style.css').read_text()
if failures:raise SystemExit('\n'.join(failures))
print('PASS: routes, local assets, image alt, h1, script policy, external link isolation, reduced motion')
