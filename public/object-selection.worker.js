// Browser-only selection: image pixels never leave this worker. Dependencies and
// model weights are fetched on demand, pinned, and cached by Transformers.js.
const LIBRARY = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/dist/transformers.min.js';
const MODEL = 'Xenova/slimsam-77-uniform';
const REVISION = '5850ab45f587c112167512ffef949107115e26a0';
let runtime, model, processor, source, cached;
let running = false;

self.onmessage = async ({data}) => {
  if (running) return;
  running = true;
  const {id} = data;
  const status = message => self.postMessage({id, type:'status', message});
  try {
    if (!runtime) {
      status('Loading object selection for the first time…');
      runtime = await import(LIBRARY);
      runtime.env.allowLocalModels = false;
      runtime.env.backends.onnx.wasm.numThreads = 1;
      runtime.env.backends.onnx.wasm.proxy = false;
    }
    if (!model) {
      [model, processor] = await Promise.all([
        runtime.SamModel.from_pretrained(MODEL, {
          revision:REVISION, device:'wasm', dtype:'q8',
          progress_callback: p => {
            if (p.status === 'progress' && Number.isFinite(p.progress))
              status(`Downloading selection model… ${Math.round(p.progress)}%`);
          },
        }),
        runtime.AutoProcessor.from_pretrained(MODEL, {revision:REVISION}),
      ]);
    }
    if (data.image) {
      source = data.image;
      cached = null;
    }
    if (!source) throw new Error('Image missing');
    const {width, height, pixels} = source;
    // A focused crop preserves small details that disappear when the whole
    // 4K frame is reduced to the model's 1024-pixel encoder input.
    const box = data.box;
    let rect = {x:0,y:0,width,height};
    if (box) {
      const x = Math.max(0, Math.floor(box.x * width));
      const y = Math.max(0, Math.floor(box.y * height));
      rect = {x,y,width:Math.max(1,Math.min(width-x,Math.ceil(box.width*width))),height:Math.max(1,Math.min(height-y,Math.ceil(box.height*height)))};
    }
    const key = JSON.stringify(rect);
    if (!cached || cached.key !== key) {
      status('Finding the object’s edges…');
      const crop = new Uint8ClampedArray(rect.width * rect.height * 4);
      for (let y=0;y<rect.height;y++) {
        const start=((rect.y+y)*width+rect.x)*4;
        crop.set(pixels.subarray(start,start+rect.width*4),y*rect.width*4);
      }
      const input = await processor(new runtime.RawImage(crop,rect.width,rect.height,4));
      const embeddings = await model.get_image_embeddings(input);
      cached = {key,input,embeddings};
    }
    status('Selecting the outline…');
    const [rh,rw] = cached.input.reshaped_input_sizes[0];
    const px = box ? .5 : data.point.x;
    const py = box ? .5 : data.point.y;
    const points = [[px*rw,py*rh]];
    const labels = [1n];
    // Background corner hints help separate a small object from its surround.
    if (box) {
      for (const [x,y] of [[.03,.03],[.97,.03],[.03,.97],[.97,.97]]) {
        points.push([x*rw,y*rh]); labels.push(0n);
      }
    }
    const outputs = await model({
      ...cached.embeddings,
      input_points:new runtime.Tensor('float32',points.flat(),[1,1,points.length,2]),
      input_labels:new runtime.Tensor('int64',labels,[1,1,labels.length]),
    });
    const masks = await processor.post_process_masks(outputs.pred_masks,cached.input.original_sizes,cached.input.reshaped_input_sizes);
    const plane = rect.width*rect.height;
    const scores = Array.from(outputs.iou_scores.data);
    const candidates = scores.map((score,index)=>({score,mask:new Uint8Array(masks[0].data.slice(index*plane,(index+1)*plane))}));
    candidates.sort((a,b)=>b.score-a.score);
    self.postMessage({id,type:'result',rect,sourceWidth:width,sourceHeight:height,masks:candidates.map(c=>c.mask)},candidates.map(c=>c.mask.buffer));
  } catch (error) {
    // Never send image data or provider details to error telemetry.
    self.postMessage({id,type:'error',message:'Object selection could not load or finish. Check your connection and try again, or use Paint.'});
  } finally {
    running = false;
  }
};
