from PIL import Image, ImageDraw
P="#2F5D62"; PAPER="#F4F2EE"; ACC="#E0916B"
def tile(size, rounded, inner):
    im=Image.new("RGBA",(size,size),(0,0,0,0)); d=ImageDraw.Draw(im)
    if rounded: d.rounded_rectangle((0,0,size-1,size-1),radius=int(size*.22),fill=P)
    else: d.rectangle((0,0,size,size),fill=P)
    c=size/2; r=size*inner/2
    d.ellipse((c-r,c-r,c+r,c+r),fill=PAPER)             # big circle = the money
    r2=size*inner*.17; ox=c+r*.62; oy=c+r*.62
    d.ellipse((ox-r2,oy-r2,ox+r2,oy+r2),fill=ACC)       # the sobra (leftover)
    return im
tile(512,True,.56).save("icon-512.png"); tile(192,True,.56).save("icon-192.png")
tile(512,False,.46).save("icon-maskable-512.png"); tile(180,False,.56).convert("RGB").save("apple-touch-icon.png")
open("favicon.svg","w").write('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#2F5D62"/><circle cx="32" cy="32" r="18" fill="#F4F2EE"/><circle cx="43" cy="43" r="6.5" fill="#E0916B"/></svg>')
