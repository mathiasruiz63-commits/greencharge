"""Package local data and images; no network or credential access."""
from pathlib import Path
import base64,json,zipfile
root=Path(__file__).resolve().parent
kit=root.parent/'wordpress-kit'
def read_file(path):
 local=kit/path
 if local.is_file():return local.read_bytes()
 with zipfile.ZipFile(root.parent/'GreenCharge.zip') as z:return z.read('GreenCharge/'+path)
def read_text(path):return read_file(path).decode('utf-8')
article=json.loads(read_text('contenido.json'))['article']
bundle={'schema':1,'allowedHosts':['sjjsjdjsdotblog.wordpress.com','greenchargeudd.wordpress.com'],'pages':[],'article':{'slug':article['slug'],'title':article['title'],'content':read_text('wordpress/'+article['slug']+'.html')},'images':{},'flourish':{'sesiones':'','costos':''}}
for slug,title in [('inicio','Inicio'),('empresa','Empresa'),('soluciones','Soluciones'),('contacto','Contacto')]:
 bundle['pages'].append({'slug':slug,'title':title,'content':read_text('wordpress/'+slug+'.html')})
for name,alt in [('hogar','Cargador residencial junto a un vehículo eléctrico; imagen conceptual generada con IA.'),('estacion','Estación conceptual de carga para vehículos eléctricos en Santiago.'),('equipo','Inspección conceptual de un cargador cerrado; imagen generada con IA.')]:
 bundle['images'][name]={'filename':name+'.png','mime':'image/png','alt':alt,'base64':base64.b64encode(read_file('assets/'+name+'.png')).decode('ascii')}
(root/'extension/bundle.json').write_text(json.dumps(bundle,ensure_ascii=False,separators=(',',':')))
target=root.parent/'GreenCharge-Automatico.zip'
with zipfile.ZipFile(target,'w',zipfile.ZIP_DEFLATED,compresslevel=6) as z:
 for p in sorted((root/'extension').rglob('*')):
  if p.is_file():z.write(p,Path('GreenCharge-Automatico')/p.relative_to(root/'extension'))
 z.write(root/'LEEME.md','LEEME.md')
with zipfile.ZipFile(target) as z:assert z.testzip() is None
print(target,target.stat().st_size,'bytes')
