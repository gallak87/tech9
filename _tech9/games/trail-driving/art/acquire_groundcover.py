"""Optional online refresh of pinned CC0 source plants, then retain chosen meshes.

Normal asset builds are offline and use the committed reduced source glTFs.
Run `python3 art/acquire_groundcover.py --download` only to reacquire originals.
Without --download this script prunes the existing local source meshes.
"""
from pathlib import Path
import hashlib
import json
import sys
import urllib.request

ROOT=Path(__file__).resolve().parent

def prune(asset,selected):
    path=ROOT/'sources'/asset/(asset+'.gltf')
    doc=json.loads(path.read_text())
    nodes=[n for n in doc['nodes'] if n.get('name') in selected]
    if len(nodes)!=len(selected):raise RuntimeError('Missing selected source meshes')
    mesh_ids=[n['mesh'] for n in nodes]
    meshes=[doc['meshes'][i] for i in mesh_ids]
    accessor_ids=sorted({i for m in meshes for p in m['primitives'] for i in [p['indices'],*p['attributes'].values()]})
    amap={old:new for new,old in enumerate(accessor_ids)}
    accessors=[doc['accessors'][i] for i in accessor_ids]
    view_ids=sorted({a['bufferView'] for a in accessors})
    vmap={old:new for new,old in enumerate(view_ids)}
    raw=(path.parent/doc['buffers'][0]['uri']).read_bytes()
    views=[];out=bytearray()
    for old in view_ids:
        v=doc['bufferViews'][old].copy();start=v.get('byteOffset',0)
        out.extend(b'\0'*((-len(out))%4))
        v['byteOffset']=len(out);out.extend(raw[start:start+v['byteLength']]);views.append(v)
    for a in accessors:a['bufferView']=vmap[a['bufferView']]
    for m in meshes:
        for p in m['primitives']:
            p['indices']=amap[p['indices']]
            p['attributes']={k:amap[v] for k,v in p['attributes'].items()}
    for i,n in enumerate(nodes):n['mesh']=i
    doc.update(nodes=nodes,meshes=meshes,accessors=accessors,bufferViews=views,scenes=[{'name':asset+' selected variants','nodes':list(range(len(nodes)))}],scene=0)
    doc['buffers'][0]['byteLength']=len(out)
    (path.parent/doc['buffers'][0]['uri']).write_bytes(out)
    path.write_text(json.dumps(doc,separators=(',',':'))+'\n')
    print(asset+': '+str(len(out))+' source geometry bytes, '+str(len(nodes))+' selected variants')

manifest=json.loads((ROOT/'sources'/'manifest.json').read_text())
for asset,entry in manifest.items():
    if '--download' in sys.argv:
        for file in entry['files']:
            data=urllib.request.urlopen(file['url'],timeout=45).read()
            if hashlib.md5(data).hexdigest()!=file['md5']:raise RuntimeError('Source checksum mismatch: '+file['url'])
            path=ROOT/'sources'/asset/file['path'];path.parent.mkdir(parents=True,exist_ok=True);path.write_bytes(data)
    prune(asset,entry['selectedNodes'])
