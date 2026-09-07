"""Original reclaimed tide pump: bolted motor, utility pipes, manual valve, cabinet.
Only the existing local Dusk authoring helpers/materials are reused.
"""
import runpy,sys,math,json,hashlib
from pathlib import Path
PREP=Path(__file__).resolve().parents[2]
sys.argv=[str(__file__),'--','r1','pump']
a=runpy.run_path(str(PREP/'assets/coast/author_coast.py'))
bpy=a['bpy'];box=a['box'];cyl=a['cyl'];beam=a['beam'];torus=a['torus']

def pump():
    box('Concrete equipment plinth',(0,0,.16),(3.1,2.0,.32),a['concrete'],.075)
    for x in [-.8,.65]:box('Motor mounting saddle',(x,0,.51),(.34,1.18,.4),a['rust'])
    motor=cyl('Reclaimed teal motor',(-.2,0,1.02),.56,1.9,a['teal'],24);motor.rotation_euler.y=math.pi/2
    for x in [-1.17,-.9,.44,.78]:
        flange=cyl('Bolted casing flange',(x,0,1.02),.61,.08,a['rust'],24);flange.rotation_euler.y=math.pi/2
        for i in range(8):
            angle=i*math.tau/8
            bolt=cyl('Casing bolt',(x+.051,.52*math.cos(angle),1.02+.52*math.sin(angle)),.033,.05,a['rust'],6);bolt.rotation_euler.y=math.pi/2
    beam('Discharge pipe',(.8,0,1.02),(1.3,0,1.02),.16,a['rust'])
    beam('Repaired vertical outlet',(1.3,0,.34),(1.3,0,2.28),.16,a['teal'])
    beam('Outlet elbow',(1.3,0,2.28),(1.3,.64,2.28),.16,a['teal'])
    torus('Manual shutoff wheel',(1.3,0,1.74),.32,.032,a['rust'])
    for i in range(4):
        angle=i*math.tau/4;beam('Valve spoke',(1.3,0,1.74),(1.3+.31*math.cos(angle),.31*math.sin(angle),1.74),.02,a['rust'])
    box('Weathered electrical cabinet',(-1.0,.75,1.26),(.8,.4,1.68),a['teal'])
    box('Cabinet door',(-1.0,.52,1.26),(.70,.06,1.54),a['rust'],.015)
    box('Reused status glass',(-1.0,.48,1.55),(.42,.02,.24),a['darkstone'],.012)
    box('Power strip',(-1.0,.465,1.54),(.22,.01,.025),a['light'],.002)
    for z in [.6,.72,.84]:box('Vent slot',(-1.0,.476,z),(.42,.025,.032),a['darkstone'],.004)
    for x in [-1.3,-.7]:cyl('Plinth anchor',(x,-.72,.35),.047,.06,a['rust'],6)

a['publish']('pump',pump)
p=PREP/'assets/coast.pump/asset.json';meta=json.loads(p.read_text())
meta['source_files'].append({'path':str(Path(__file__).relative_to(PREP)),'role':'pump_authoring_script','sha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest()})
p.write_text(json.dumps(meta,indent=2)+'\n')
