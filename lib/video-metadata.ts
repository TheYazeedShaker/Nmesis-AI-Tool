import {Input,ALL_FORMATS,BufferSource} from 'mediabunny';
import {StudioError} from './studio-server';
export async function verifiedMp4Info(bytes:Uint8Array){
 const input=new Input({source:new BufferSource(bytes),formats:ALL_FORMATS});
 try{const video=await input.getPrimaryVideoTrack();if(!video)throw new StudioError('The reference ad needs a video track.');const [duration,width,height]=await Promise.all([input.computeDuration(),video.getCodedWidth(),video.getCodedHeight()]);if(!Number.isFinite(duration)||duration<4||duration>30)throw new StudioError('Use a reference ad between 4 and 30 seconds.');if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width*height<409600)throw new StudioError(`This ad is ${width}×${height}. Higgsfield needs at least 409,600 pixels per frame. Use a higher-resolution source, such as 720×1280 portrait video.`);return{duration,width,height}}
 catch(e){if(e instanceof StudioError)throw e;throw new StudioError('This MP4 could not be read. Export it as a standard MP4 and try again.')}
 finally{input.dispose()}
}
