import { PrismaClient } from '@prisma/client';
import { Redis } from 'ioredis';
import { Queue } from 'bullmq';
import { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand, CreateBucketCommand, HeadBucketCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from './config.js';
export const db=new PrismaClient();
export const redis=new Redis(env.REDIS_URL,{maxRetriesPerRequest:null});
export const imports=new Queue('imports',{connection:redis});
export const builds=new Queue('android-builds',{connection:redis});
export const s3=new S3Client({endpoint:env.STORAGE_ENDPOINT,region:env.STORAGE_REGION,forcePathStyle:env.STORAGE_FORCE_PATH_STYLE,credentials:{accessKeyId:env.STORAGE_ACCESS_KEY,secretAccessKey:env.STORAGE_SECRET_KEY}});
const publicS3=new S3Client({endpoint:env.PUBLIC_STORAGE_ENDPOINT??env.STORAGE_ENDPOINT,region:env.STORAGE_REGION,forcePathStyle:env.STORAGE_FORCE_PATH_STYLE,credentials:{accessKeyId:env.STORAGE_ACCESS_KEY,secretAccessKey:env.STORAGE_SECRET_KEY}});
export async function ensureBucket(){try{await s3.send(new HeadBucketCommand({Bucket:env.STORAGE_BUCKET}));}catch(error){if((error as {$metadata?:{httpStatusCode?:number}}).$metadata?.httpStatusCode!==404)throw error;await s3.send(new CreateBucketCommand({Bucket:env.STORAGE_BUCKET}));}}
export async function putObject(key:string,body:Buffer,contentType='application/octet-stream'){await s3.send(new PutObjectCommand({Bucket:env.STORAGE_BUCKET,Key:key,Body:body,ContentType:contentType}));return key;}
export async function getObject(key:string){const result=await s3.send(new GetObjectCommand({Bucket:env.STORAGE_BUCKET,Key:key}));if(!result.Body)throw new Error('Objeto inexistente');return Buffer.from(await result.Body.transformToByteArray());}
export async function hasObject(key:string){try{await s3.send(new HeadObjectCommand({Bucket:env.STORAGE_BUCKET,Key:key}));return true;}catch(error){if((error as {$metadata?:{httpStatusCode?:number}}).$metadata?.httpStatusCode===404)return false;throw error;}}
export async function deleteObject(key:string){await s3.send(new DeleteObjectCommand({Bucket:env.STORAGE_BUCKET,Key:key}));}
export async function objectUrl(key:string,filename?:string){return getSignedUrl(publicS3,new GetObjectCommand({Bucket:env.STORAGE_BUCKET,Key:key,...(filename?{ResponseContentDisposition:`attachment; filename="${filename.replace(/[^a-zA-Z0-9._-]/g,'_')}"`}:{})}),{expiresIn:900});}
export async function closeInfra(){await Promise.allSettled([imports.close(),builds.close()]);await redis.quit();await db.$disconnect();s3.destroy();publicS3.destroy();}
