import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/db";
import { assertSameOrigin, jsonError, requireApiUser } from "@/lib/http";
import { getSavedResearch } from "@/lib/team-api";

type Context = { params: Promise<{id: string}> };
const root = () => path.resolve(process.env.UPLOAD_DIR || "uploads", "avatars");
const photoPath = (id: string) => path.join(root(), `${id}.json`);

export async function GET(_req: Request, {params}: Context) {
  const {user,response}=await requireApiUser(); if(!user)return response;
  const person=await prisma.person.findFirst({where:{id:(await params).id,userId:user.id}});
  if(!person)return jsonError("Person not found.",404);
  try {
    const photo=JSON.parse(await readFile(photoPath(person.id),"utf8"));
    return new Response(new Uint8Array(Buffer.from(photo.data,"base64")),{headers:{"Content-Type":photo.type,"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}});
  } catch { /* Fall through to a verified profile photo; never start a paid scrape here. */ }
  if(person.backendPersonId){
    const brief=await getSavedResearch(person.backendPersonId).catch(()=>null);
    try {
      const url=new URL(brief?.profile?.photoUrl || "");
      if(url.protocol==="https:" && /(^|\.)licdn\.com$/.test(url.hostname))
        return new Response(null,{status:302,headers:{Location:url.href,"Cache-Control":"private, no-store"}});
    } catch { /* No usable photo. */ }
  }
  return new Response(null,{status:404,headers:{"Cache-Control":"no-store"}});
}

export async function POST(req: Request,{params}:Context){
  const blocked=assertSameOrigin(req);if(blocked)return blocked;
  const {user,response}=await requireApiUser();if(!user)return response;
  const person=await prisma.person.findFirst({where:{id:(await params).id,userId:user.id}});
  if(!person)return jsonError("Person not found.",404);
  if(Number(req.headers.get("content-length"))>1150000)return jsonError("Choose a photo under 1 MB.",413);
  const form=await req.formData().catch(()=>null);const file=form?.get("photo");
  if(!(file instanceof File)||!file.size||file.size>1048576)return jsonError("Choose a photo under 1 MB.",400);
  const bytes=Buffer.from(await file.arrayBuffer());
  const type=bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))?"image/png":bytes[0]===255&&bytes[1]===216&&bytes[2]===255?"image/jpeg":bytes.toString("ascii",0,4)==="RIFF"&&bytes.toString("ascii",8,12)==="WEBP"?"image/webp":null;
  if(!type)return jsonError("Choose a JPG, PNG or WebP photo.",400);
  await mkdir(root(),{recursive:true});
  await writeFile(photoPath(person.id),JSON.stringify({type,data:bytes.toString("base64")}));
  return Response.json({ok:true});
}
