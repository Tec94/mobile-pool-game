from PIL import Image, ImageDraw, ImageFont
F='/home/claude/mobile-pool-game/node_modules/@expo-google-fonts/'
H=ImageFont.truetype(F+'bricolage-grotesque/800ExtraBold/BricolageGrotesque_800ExtraBold.ttf',128)
S=ImageFont.truetype(F+'instrument-sans/600SemiBold/InstrumentSans_600SemiBold.ttf',56)
W,HH=1320,2868
slides=[('sc0','Real pool physics','Every bank, cut and spin plays true.',(30,63,58),(239,230,210)),
 ('scatter','Break it wide open','8-ball and 9-ball. AI from Rookie to Legend.',(224,72,60),(255,255,255)),
 ('cues','Collect 17 wild cues','From Broomstick to Lightning Rod.',(63,191,127),(16,31,28)),
 ('pull','Pull back. Let it rip.','Power, spin and aim you can feel.',(132,72,200),(255,255,255)),
 ('home','Pay once. No ads.','Lessons, trick shots, daily tables, pass and play.',(75,152,238),(255,255,255))]
out='/mnt/project-files/app-store/screenshots/'
for k,(f,h,s,bg,fg) in enumerate(slides,1):
    c=Image.new('RGB',(W,HH),bg); d=ImageDraw.Draw(c)
    sz=128
    while ImageFont.truetype(H.path,sz).getlength(h)>1200: sz-=4
    d.text((W/2,200),h,font=ImageFont.truetype(H.path,sz),fill=fg,anchor='mm')
    s2=56
    while ImageFont.truetype(S.path,s2).getlength(s)>1200: s2-=2
    d.text((W/2,330),s,font=ImageFont.truetype(S.path,s2),fill=fg,anchor='mm')
    sc=0.80; im=Image.open('hi/'+f+'.png').convert('RGB'); w,hh=int(1320*sc),int(2868*sc)
    im=im.resize((w,hh),Image.LANCZOS)
    m=Image.new('L',(w,hh),0); ImageDraw.Draw(m).rounded_rectangle((0,0,w,hh),72,fill=255)
    x,y=(W-w)//2,440
    sh=Image.new('L',(w+40,hh+40),0); ImageDraw.Draw(sh).rounded_rectangle((20,20,w+20,hh+20),80,fill=90)
    c.paste((0,0,0),(x-20,y-4),sh)
    c.paste(im,(x,y),m)
    c.save(f'{out}{k:02d}-{f}.png')
    assert c.size==(1320,2868)
prev=[Image.open(f'{out}{k:02d}-{s[0]}.png').resize((330,717)) for k,s in enumerate(slides,1)]
p=Image.new('RGB',(340*5,717),(20,20,20)); [p.paste(i,(k*340,0)) for k,i in enumerate(prev)]; p.save('preview.png')
