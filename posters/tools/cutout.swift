import Foundation
import Vision
import CoreImage
import ImageIO
import UniformTypeIdentifiers
let a=CommandLine.arguments
let url=URL(fileURLWithPath:a[1]), out=URL(fileURLWithPath:a[2])
guard let src=CGImageSourceCreateWithURL(url as CFURL,nil), let img=CGImageSourceCreateImageAtIndex(src,0,nil) else{print("load fail");exit(1)}
let req=VNGenerateForegroundInstanceMaskRequest()
let h=VNImageRequestHandler(cgImage:img,options:[:])
try h.perform([req])
guard let r=req.results?.first else{print("no subject");exit(2)}
print("instances:",r.allInstances.count)
let buf=try r.generateMaskedImage(ofInstances:r.allInstances,from:h,croppedToInstancesExtent:true)
let ci=CIImage(cvPixelBuffer:buf), ctx=CIContext()
try ctx.writePNGRepresentation(of:ci,to:out,format:.RGBA8,colorSpace:CGColorSpace(name:CGColorSpace.sRGB)!)
print("ok",ci.extent.size)
