import sys, json
from PIL import Image, ImageDraw, ImageFont

out=sys.argv[1]
p=json.load(sys.stdin)
w,h=1200,760
im=Image.new('RGB',(w,h),(13,18,30)); d=ImageDraw.Draw(im)
try: font=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',22); small=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',16)
except: font=small=ImageFont.load_default()
cs=p['candles'][-48:]; ch=p['channel']; n=len(cs)
lo=min([c['l'] for c in cs]+[ch['lower']-abs(ch['slope'])*12]); hi=max([c['h'] for c in cs]+[ch['upper']+abs(ch['slope'])*12]); pad=(hi-lo)*.10 or 1; lo-=pad; hi+=pad
left,right,top,bottom=90,1140,130,670
xstep=(right-left)/max(1,n); y=lambda v: bottom-(v-lo)/(hi-lo)*(bottom-top)
d.text((55,28),f"NOVARA  |  {p['coin']}  |  {p['side']}  |  {p['setup']}",font=font,fill=(235,241,255))
d.text((55,68),f"1H {ch['type']} CHANNEL  •  Lower {ch['lower']:.6g}  •  Upper {ch['upper']:.6g}  •  Touches L{ch['lowerTouches']}/U{ch['upperTouches']}",font=small,fill=(170,190,220))
for k in range(5):
 v=lo+(hi-lo)*k/4; yy=y(v); d.line((left,yy,right,yy),fill=(39,49,68),width=1); d.text((8,yy-8),f'{v:.5g}',font=small,fill=(145,160,185))
# Parallel rails projected from the latest 1H close; 4 x 15m candles per 1H bar.
for key,col in [('upper',(240,90,95)),('lower',(55,205,145))]:
 vals=[]
 for i in range(n):
  back=(n-1-i)/4
  vals.append((left+(i+.5)*xstep,y(ch[key]-ch['slope']*back)))
 d.line(vals,fill=col,width=4)
for i,c in enumerate(cs):
 x=left+(i+.5)*xstep; yo,yc=y(c['o']),y(c['c']); color=(52,205,145) if c['c']>=c['o'] else (235,90,100)
 d.line((x,y(c['h']),x,y(c['l'])),fill=color,width=2)
 d.rectangle((x-max(2,xstep*.28),min(yo,yc),x+max(2,xstep*.28),max(yo,yc)+1),fill=color)
d.line((left,bottom,right,bottom),fill=(100,115,140),width=1)
d.text((55,705),f"Trigger: {p.get('confirmation','')}  |  Paper signal only — no order placed",font=small,fill=(185,195,215))
im.save(out,optimize=True)
