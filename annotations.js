(() => {
"use strict";
const KEY="videoClockAnnotations", PANEL_KEY="videoClockPanelPosition";
const canvas=document.createElement("canvas");canvas.id="annotationCanvas";
const hitLayer=document.createElement("div");hitLayer.id="annotationHitLayer";
const selection=document.createElement("div");selection.id="annotationSelection";selection.hidden=true;
selection.innerHTML='<button type="button" id="annotationDeleteSelected" title="Delete" aria-label="Delete item">×</button><button type="button" id="annotationResize" title="Resize" aria-label="Resize item">↘</button>';
const toggle=document.createElement("button");toggle.id="annotationToggle";toggle.type="button";toggle.textContent="✎";toggle.title="Draw or type";toggle.setAttribute("aria-expanded","false");
const toolbar=document.createElement("section");toolbar.id="annotationToolbar";toolbar.hidden=true;
toolbar.setAttribute("aria-label","Text and drawing controls");
toolbar.innerHTML=[
'<div class="annotation-heading" id="annotationDragBar"><span title="Drag to move the settings">⠿ &nbsp; Draw &amp; write</span><button id="annotationDone" type="button">Done</button></div>',
'<div class="annotation-tool-row"><button type="button" class="annotation-tool selected" data-annotation-mode="text">T &nbsp; Text</button><button type="button" class="annotation-tool" data-annotation-mode="draw">✎ &nbsp; Draw</button></div>',
'<div class="annotation-options"><label for="annotationColor">Colour</label><input type="color" id="annotationColor" value="#ffffff"></div>',
'<div id="annotationTextControls" class="annotation-control-section">',
'<label for="annotationText">Message</label><textarea id="annotationText" rows="3" maxlength="500" placeholder="Start typing and see it appear on the clock…"></textarea>',
'<label for="annotationSize">Text size <output id="annotationSizeValue">34</output></label><input id="annotationSize" type="range" min="14" max="100" value="34">',
'<label for="annotationFont">Font</label><select id="annotationFont"><option value="caveat">Handwriting</option><option value="arial">Arial</option><option value="cutive">Typewriter</option><option value="vibes">Calligraphy</option></select>',
'<span class="annotation-small-label">Alignment</span><div class="annotation-align-row"><button type="button" data-annotation-align="left" class="selected" title="Align Left" aria-label="Align Left" aria-pressed="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 6h16 M4 10h11 M4 14h16 M4 18h11"/></svg><span>Left</span></button><button type="button" data-annotation-align="center" class="" title="Align Centre" aria-label="Align Centre" aria-pressed="false"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 6h16 M6.5 10h11 M4 14h16 M6.5 18h11"/></svg><span>Centre</span></button><button type="button" data-annotation-align="right" class="" title="Align Right" aria-label="Align Right" aria-pressed="false"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 6h16 M9 10h11 M4 14h16 M9 18h11"/></svg><span>Right</span></button></div>',
'<p class="annotation-hint">Text appears immediately. Drag it on the screen to move it, or drag its corner to resize.</p>',
'<div class="annotation-text-actions"><button id="annotationSaveText" type="button" class="annotation-action">✓ Save text</button><button id="annotationNewText" type="button" class="annotation-action">+ New text</button></div>',
'</div>',
'<div id="annotationDrawControls" class="annotation-control-section" hidden>',
'<label for="annotationPenSize">Pen thickness <output id="annotationPenValue">8</output></label><input id="annotationPenSize" type="range" min="1" max="30" value="8">',
'<button type="button" id="annotationEraser" class="annotation-action" aria-pressed="false">⌫ Eraser: off</button>',
'<label for="annotationEraserSize">Eraser thickness <output id="annotationEraserValue">30</output></label><input id="annotationEraserSize" type="range" min="8" max="100" value="30">',
'<p class="annotation-hint">Draw with your mouse or finger. Finish to move or resize the entire doodle.</p>',
'<button type="button" id="annotationFinishDoodle" class="annotation-action">✓ Finish doodle</button></div>',
'<div class="annotation-bottom-actions"><button type="button" id="annotationUndo" class="annotation-action">↶ Undo</button><button type="button" id="annotationClear" class="annotation-action">Clear all</button></div>'
].join("");
document.body.append(canvas,hitLayer,selection,toolbar,toggle);
const ctx=canvas.getContext("2d");if(!ctx){toggle.hidden=true;return;}
const $=id=>document.getElementById(id);
const color=$("annotationColor"),input=$("annotationText"),size=$("annotationSize"),font=$("annotationFont");
const pen=$("annotationPenSize"),eraserSize=$("annotationEraserSize");
const modeButtons=[...toolbar.querySelectorAll("[data-annotation-mode]")],alignButtons=[...toolbar.querySelectorAll("[data-annotation-align]")];
const W=()=>Math.max(innerWidth,1),H=()=>Math.max(innerHeight,1);
const clamp=(v,a,b)=>Math.min(Math.max(v,a),Math.max(a,b));
const copy=x=>JSON.parse(JSON.stringify(x));
const faces={caveat:'"Caveat", cursive',arial:'Arial, sans-serif',cutive:'"Cutive Mono", monospace',vibes:'"Great Vibes", cursive'};
let items=[],draft=null,strokes=[],chosen=null,mode="text",erasing=false,gesture=null,panelDrag=null,clearArmed=false,undoHistory=[];
let textChanged=false;
const hotspots=new Map();
const enabled=()=>document.body.classList.contains("annotation-mode");
const current=()=>chosen==="draft"?draft:typeof chosen==="number"?items[chosen]:null;
const object=item=>item&&(item.type==="text"||item.type==="doodle");
const remember=()=>{undoHistory.push(copy(items));if(undoHistory.length>40)undoHistory.shift();};
const save=()=>{try{localStorage.setItem(KEY,JSON.stringify(items));}catch(e){console.warn("Could not save annotations",e);}};
const point=e=>[clamp(e.clientX/W(),0,1),clamp(e.clientY/H(),0,1)];
const cssFont=item=>'500 '+(item.size||34)+'px '+(faces[item.font]||faces.caveat);
function metrics(item){
  ctx.font=cssFont(item);
  const lines=(item.text||"").split("\n");
  return {w:Math.max(24,...lines.map(line=>ctx.measureText(line).width+8)),h:Math.max(20,lines.length*(item.size||34)*1.23+5)};
}
function measure(item){const m=metrics(item);item.w=m.w/W();item.h=m.h/H();}
function normalizeText(item){
  item.size=clamp(Number(item.size)||34,10,500);
  item.font=faces[item.font]?item.font:"caveat";
  item.align=["left","center","right"].includes(item.align)?item.align:"left";
  item.color=/^#[0-9a-f]{6}$/i.test(item.color||"")?item.color:"#ffffff";
  item.x=clamp(Number(item.x)||0,0,1);item.y=clamp(Number(item.y)||0,0,1);
  measure(item);
}
function bundle(strokes){
 const drawn=strokes.filter(s=>!s.erase).flatMap(s=>s.points||[]);
 if(!drawn.length)return null;
 const x0=Math.min(...drawn.map(p=>p[0])),x1=Math.max(...drawn.map(p=>p[0]));
 const y0=Math.min(...drawn.map(p=>p[1])),y1=Math.max(...drawn.map(p=>p[1]));
 const w=Math.max(.001,x1-x0),h=Math.max(.001,y1-y0);
 return {type:"doodle",x:x0,y:y0,w,h,baseW:w,strokes:strokes.map(s=>({
  color:s.color||"#ffffff",width:s.width||8,erase:!!s.erase,
  points:(s.points||[]).map(p=>[(p[0]-x0)/w,(p[1]-y0)/h])
 }))};
}
try{
 const saved=JSON.parse(localStorage.getItem(KEY)||"[]");
 if(Array.isArray(saved))items=saved.flatMap(item=>{
  if(!item||typeof item!=="object")return [];
  if(item.type==="text"){normalizeText(item);return [item];}
  if(item.type==="doodle"&&Array.isArray(item.strokes))return [item];
  if(item.type==="stroke"&&item.erase)return [item];
  if(item.type==="stroke"){const x=bundle([item]);return x?[x]:[];}
  return [];
 });
}catch(e){console.warn("Annotations could not be read",e);}
function drawLine(g,s,transform,scale){
 const pts=s.points||[];if(!pts.length)return;
 g.lineWidth=Math.max(1,(s.width||8)*scale);g.lineCap="round";g.lineJoin="round";g.strokeStyle=s.color||"#ffffff";
 g.beginPath();const p=transform(pts[0]);g.moveTo(p[0],p[1]);
 if(pts.length===1)g.lineTo(p[0]+.01,p[1]);
 else for(let i=1;i<pts.length;i++){const q=transform(pts[i]);g.lineTo(q[0],q[1]);}
 g.stroke();
}
function drawDoodle(item){
 const bw=item.w*W(),bh=item.h*H(),scale=item.baseW?item.w/item.baseW:1;
 if(!bw||!bh)return;
 const pad=Math.max(30,50*scale);
 const c=document.createElement("canvas");
 c.width=Math.min(4096,Math.ceil(bw+2*pad));c.height=Math.min(4096,Math.ceil(bh+2*pad));
 const g=c.getContext("2d");if(!g)return;
 for(const s of item.strokes){
  g.globalCompositeOperation=s.erase?"destination-out":"source-over";
  drawLine(g,s,p=>[pad+p[0]*bw,pad+p[1]*bh],scale);
 }
 ctx.drawImage(c,item.x*W()-pad,item.y*H()-pad);
}
function drawText(item){
 ctx.save();ctx.font=cssFont(item);ctx.textBaseline="top";ctx.textAlign=item.align||"left";ctx.fillStyle=item.color||"#ffffff";
 const m=metrics(item),anchor=item.x*W()+(item.align==="center"?m.w/2:item.align==="right"?m.w:0);
 (item.text||"").split("\n").forEach((line,i)=>ctx.fillText(line,anchor,item.y*H()+i*item.size*1.23));
 ctx.restore();
}
function rect(item){
 if(item.type==="text")measure(item);
 return {x:item.x*W(),y:item.y*H(),w:item.w*W(),h:item.h*H()};
}
function updateHotspots(){
 hitLayer.classList.toggle("disabled",(enabled()&&mode==="draw")||document.body.classList.contains("design-mode"));
 const valid=new Set();
 items.forEach((item,i)=>{
  if(!object(item))return;
  valid.add(i);let node=hotspots.get(i);
  if(!node){
   node=document.createElement("div");node.className="annotation-hotspot";node.setAttribute("role","button");
   node.setAttribute("tabindex","0");node.dataset.index=String(i);
   node.addEventListener("pointerdown",e=>chooseViaPointer(e,node));
   node.addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();choose(Number(node.dataset.index));}});
   hitLayer.append(node);hotspots.set(i,node);
  }
  node.dataset.index=String(i);
  const r=rect(item),pad=item.type==="doodle"?10:3;
  Object.assign(node.style,{left:(r.x-pad)+"px",top:(r.y-pad)+"px",width:Math.max(22,r.w+pad*2)+"px",height:Math.max(22,r.h+pad*2)+"px"});
 });
 for(const [i,node] of hotspots)if(!valid.has(i)){node.remove();hotspots.delete(i);}
}
function updateSelection(){
 const item=current();
 const visible=object(item)&&!document.body.classList.contains("design-mode")&&!(enabled()&&mode==="draw");
 selection.hidden=!visible;
 if(!visible)return;
 const r=rect(item),p=9;
 Object.assign(selection.style,{left:(r.x-p)+"px",top:(r.y-p)+"px",width:Math.max(30,r.w+p*2)+"px",height:Math.max(30,r.h+p*2)+"px"});
}
function redraw(){
 ctx.clearRect(0,0,W(),H());
 items.forEach(item=>{if(item.type==="doodle")drawDoodle(item);});
 ctx.save();
 for(const stroke of strokes){
  ctx.globalCompositeOperation=stroke.erase?"destination-out":"source-over";
  drawLine(ctx,stroke,p=>[p[0]*W(),p[1]*H()],1);
 }
 for(const s of items)if(s.type==="stroke"&&s.erase){
  ctx.globalCompositeOperation="destination-out";
  drawLine(ctx,s,p=>[p[0]*W(),p[1]*H()],1);
 }
 ctx.restore();
 items.forEach(item=>{if(item.type==="text")drawText(item);});
 if(draft&&draft.text)drawText(draft);
 updateHotspots();updateSelection();
}
function resize(){
 const dpr=Math.min(devicePixelRatio||1,2);canvas.width=Math.round(W()*dpr);canvas.height=Math.round(H()*dpr);
 ctx.setTransform(dpr,0,0,dpr,0,0);
 items.forEach(item=>{if(item.type==="text")measure(item);});if(draft)measure(draft);
 redraw();
}
function syncTextControls(item){
 color.value=item.color||"#ffffff";
 const swatch=$("annotationColorButtonSwatch");if(swatch)swatch.style.background=color.value;
 input.value=item.text||"";size.value=String(clamp(item.size||34,14,100));$("annotationSizeValue").value=size.value;
 font.value=item.font||"caveat";
 alignButtons.forEach(b=>{
  const yes=b.dataset.annotationAlign===(item.align||"left");
  b.classList.toggle("selected",yes);b.setAttribute("aria-pressed",String(yes));
 });
}
function choose(i){
 if(chosen==="draft")commitText();
 chosen=i;textChanged=false;
 if(items[i]?.type==="text"){syncTextControls(items[i]);if(enabled())setMode("text",true);}
 redraw();
}
function chooseViaPointer(e,node){
 if(enabled()&&mode==="draw")return;
 const i=Number(node.dataset.index);if(!object(items[i]))return;
 if(chosen!==i)choose(i);
 startObjectGesture(e,node,"move");
}
function startObjectGesture(e,target,kind){
 const item=current();if(gesture||!object(item))return;
 e.preventDefault();e.stopPropagation();
 gesture={pointer:e.pointerId,kind,x:e.clientX,y:e.clientY,original:{x:item.x,y:item.y,w:item.w,h:item.h,size:item.size},
 before:chosen==="draft"?null:copy(items),dirty:false};
 target.setPointerCapture(e.pointerId);
}
selection.addEventListener("pointerdown",e=>{
 if(e.target.id==="annotationResize"||e.target.id==="annotationDeleteSelected")return;
 startObjectGesture(e,selection,"move");
});
$("annotationResize").addEventListener("pointerdown",e=>startObjectGesture(e,$("annotationResize"),"resize"));
$("annotationDeleteSelected").addEventListener("click",e=>{
 e.preventDefault();e.stopPropagation();
 if(chosen==="draft")draft=null;
 else if(typeof chosen==="number"&&items[chosen]){remember();items.splice(chosen,1);save();}
 chosen=null;input.value="";redraw();
});
function placeText(item){
 const panel=toolbar.getBoundingClientRect(),r=rect(item);
 let x=W()*.43,y=H()*.42;
 if(!toolbar.hidden&&x<panel.right+18&&x+r.w>panel.left-18&&y<panel.bottom+18&&y+r.h>panel.top-18){
  if(panel.right<W()*.72)x=panel.right+25;
  else if(panel.left>r.w+20)x=panel.left-r.w-20;
  else y=panel.bottom+22;
 }
 item.x=clamp(x/W(),0,Math.max(0,1-item.w));item.y=clamp(y/H(),0,Math.max(0,1-item.h));
}
function commitText(){
 if(!draft)return;
 if(draft.text.trim()){remember();items.push(copy(draft));chosen=items.length-1;save();}
 else if(chosen==="draft")chosen=null;
 draft=null;
}
function activeAlign(){return alignButtons.find(b=>b.classList.contains("selected"))?.dataset.annotationAlign||"left";}
function onTextInput(){
 const text=input.value.slice(0,500),item=current();
 if(item&&item.type==="text"){
  if(chosen!=="draft"&&!textChanged){remember();textChanged=true;}
  item.text=text;measure(item);
  item.x=clamp(item.x,0,Math.max(0,1-item.w));item.y=clamp(item.y,0,Math.max(0,1-item.h));
  if(chosen!=="draft")save();
 }else if(text.trim()){
  draft={type:"text",text,x:0,y:0,w:0,h:0,color:color.value,size:Number(size.value),font:font.value,align:activeAlign()};
  measure(draft);placeText(draft);chosen="draft";
 }
 redraw();
}
input.addEventListener("input",onTextInput);
function applyTextControls(){
 $("annotationSizeValue").value=size.value;const item=current();
 if(!item||item.type!=="text")return;
 if(chosen!=="draft"&&!textChanged){remember();textChanged=true;}
 item.color=color.value;item.size=Number(size.value);item.font=font.value;item.align=activeAlign();
 measure(item);item.x=clamp(item.x,0,Math.max(0,1-item.w));item.y=clamp(item.y,0,Math.max(0,1-item.h));
 if(chosen!=="draft")save();
 redraw();
}
size.addEventListener("input",applyTextControls);font.addEventListener("change",applyTextControls);
color.addEventListener("input",()=>{if(mode==="text")applyTextControls();});
alignButtons.forEach(b=>b.addEventListener("click",()=>{
 alignButtons.forEach(x=>{const yes=x===b;x.classList.toggle("selected",yes);x.setAttribute("aria-pressed",String(yes));});
 applyTextControls();
}));
function clearTextEditor(){input.value="";draft=null;chosen=null;textChanged=false;redraw();}
$("annotationSaveText").addEventListener("click",()=>{commitText();if(chosen!=="draft")save();clearTextEditor();});
$("annotationNewText").addEventListener("click",()=>{commitText();clearTextEditor();input.focus();});
function finishDrawing(){
 if(!strokes.length)return;
 const b=bundle(strokes);strokes=[];
 if(b){remember();items.push(b);chosen=items.length-1;save();}
 redraw();
}
function setMode(next,keep=false){
 if(mode==="draw"&&next!=="draw")finishDrawing();
 if(mode==="text"&&next!=="text")commitText();
 mode=next;document.body.classList.toggle("annotation-draw-mode",next==="draw");if(!keep)chosen=null;
 if(next==="draw")input.value="";
 $("annotationTextControls").hidden=next!=="text";$("annotationDrawControls").hidden=next!=="draw";
 modeButtons.forEach(b=>{const yes=b.dataset.annotationMode===next;b.classList.toggle("selected",yes);b.setAttribute("aria-pressed",String(yes));});
 if(next==="text"&&enabled()&&!keep)input.focus();
 redraw();
}
modeButtons.forEach(b=>b.addEventListener("click",()=>setMode(b.dataset.annotationMode)));
function show(show){
 if(!show){commitText();finishDrawing();chosen=null;input.value="";}
 if(show){if(document.body.classList.contains("design-mode"))$("doneDesignButton")?.click();$("settingsPanel")?.classList.remove("show");}
 document.body.classList.toggle("annotation-mode",show);toolbar.hidden=!show;
 toggle.setAttribute("aria-expanded",String(show));
 redraw();
}
toggle.addEventListener("click",()=>show(!enabled()));
$("annotationDone").addEventListener("click",()=>show(false));
pen.addEventListener("input",()=>{$("annotationPenValue").value=pen.value;});
eraserSize.addEventListener("input",()=>{$("annotationEraserValue").value=eraserSize.value;});
$("annotationEraser").addEventListener("click",()=>{
 erasing=!erasing;$("annotationEraser").textContent=erasing?"⌫ Eraser: on":"⌫ Eraser: off";
 $("annotationEraser").classList.toggle("selected",erasing);$("annotationEraser").setAttribute("aria-pressed",String(erasing));
});
$("annotationFinishDoodle").addEventListener("click",()=>{
 finishDrawing();erasing=false;$("annotationEraser").textContent="⌫ Eraser: off";$("annotationEraser").classList.remove("selected");
});
canvas.addEventListener("pointerdown",e=>{
 if(!enabled()||mode!=="draw"||gesture)return;
 e.preventDefault();
 const s={type:"stroke",erase:erasing,color:color.value,width:Number(erasing?eraserSize.value:pen.value),points:[point(e)]};
 if(!erasing)strokes.push(s);
 gesture={pointer:e.pointerId,kind:"draw",stroke:s,before:erasing?copy(items):null,dirty:false};
 canvas.setPointerCapture(e.pointerId);redraw();
});
const bar=$("annotationDragBar");
bar.addEventListener("pointerdown",e=>{
 if(e.target.closest("button"))return;
 const r=toolbar.getBoundingClientRect();
 panelDrag={pointer:e.pointerId,x:e.clientX,y:e.clientY,left:r.left,top:r.top};
 bar.setPointerCapture(e.pointerId);e.preventDefault();
});
function positionPanel(x,y){
 const r=toolbar.getBoundingClientRect();
 toolbar.style.left=clamp(x,0,Math.max(0,W()-r.width))+"px";
 toolbar.style.top=clamp(y,0,Math.max(0,H()-r.height))+"px";
 toolbar.style.bottom="auto";
}
try{
 const p=JSON.parse(localStorage.getItem(PANEL_KEY)||"null");
 if(p&&Number.isFinite(p.x)&&Number.isFinite(p.y)){
  toolbar.style.left=clamp(p.x,0,1)*W()+"px";toolbar.style.top=clamp(p.y,0,1)*H()+"px";toolbar.style.bottom="auto";
 }
}catch(e){}
window.addEventListener("pointermove",e=>{
 if(panelDrag&&panelDrag.pointer===e.pointerId){
  e.preventDefault();positionPanel(panelDrag.left+e.clientX-panelDrag.x,panelDrag.top+e.clientY-panelDrag.y);return;
 }
 if(!gesture||gesture.pointer!==e.pointerId)return;
 e.preventDefault();const g=gesture;
 if(g.kind==="draw"){g.stroke.points.push(point(e));g.dirty=true;}
 else{
  const item=current();if(!item)return;
  const dx=e.clientX-g.x,dy=e.clientY-g.y;
  if(g.kind==="move"){
   item.x=clamp(g.original.x+dx/W(),0,Math.max(0,1-item.w));
   item.y=clamp(g.original.y+dy/H(),0,Math.max(0,1-item.h));
  }else{
   const baseline=Math.max(40,g.original.w*W()+g.original.h*H());
   let scale=clamp(1+(dx+dy)/baseline,.25,7);
   scale=Math.min(scale,(1-item.x)/Math.max(g.original.w,.0001),(1-item.y)/Math.max(g.original.h,.0001));
   scale=Math.max(.1,scale);
   item.w=g.original.w*scale;item.h=g.original.h*scale;
   if(item.type==="text"){
    item.size=clamp(g.original.size*scale,8,500);measure(item);
    item.x=clamp(item.x,0,Math.max(0,1-item.w));item.y=clamp(item.y,0,Math.max(0,1-item.h));
    if(enabled()&&mode==="text"){$("annotationSizeValue").value=Math.round(item.size);size.value=clamp(item.size,14,100);}
   }
  }
  g.dirty=g.dirty||Math.abs(dx)+Math.abs(dy)>1;
 }
 redraw();
},{passive:false});
function endPointer(e){
 if(panelDrag&&panelDrag.pointer===e.pointerId){
  panelDrag=null;const r=toolbar.getBoundingClientRect();
  try{localStorage.setItem(PANEL_KEY,JSON.stringify({x:r.left/W(),y:r.top/H()}));}catch(_){}
 }
 if(!gesture||gesture.pointer!==e.pointerId)return;
 const g=gesture;gesture=null;
 if(g.kind==="draw"){
  if(g.stroke.erase){
   let touched=false;
   for(const obj of items)if(obj.type==="doodle"&&obj.w>0&&obj.h>0){
    obj.strokes.push({erase:true,color:g.stroke.color,width:g.stroke.width,points:g.stroke.points.map(p=>[(p[0]-obj.x)/obj.w,(p[1]-obj.y)/obj.h])});
    touched=true;
   }
   if(strokes.some(s=>!s.erase))strokes.push(copy(g.stroke));
   if(touched){undoHistory.push(g.before);if(undoHistory.length>40)undoHistory.shift();save();}
  }
 }else if(g.dirty&&chosen!=="draft"){
  undoHistory.push(g.before);if(undoHistory.length>40)undoHistory.shift();save();
 }
 redraw();
}
window.addEventListener("pointerup",endPointer);window.addEventListener("pointercancel",endPointer);
function undo(){
 if(strokes.length){strokes.pop();redraw();return;}
 if(undoHistory.length){items=undoHistory.pop();draft=null;chosen=null;input.value="";save();redraw();return;}
 if(items.length){items.pop();chosen=null;save();redraw();}
}
$("annotationUndo").addEventListener("click",undo);
$("annotationClear").addEventListener("click",()=>{
 if(!clearArmed){clearArmed=true;$("annotationClear").textContent="Clear all?";return;}
 remember();items=[];draft=null;strokes=[];chosen=null;input.value="";save();redraw();
 clearArmed=false;$("annotationClear").textContent="Clear all";
});
document.addEventListener("keydown",e=>{
 if(e.key==="Escape"){if(enabled())show(false);else{chosen=null;redraw();}return;}
 if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="z"&&enabled()&&!e.target.closest?.("textarea,input")){e.preventDefault();undo();}
 if((e.key==="Delete"||e.key==="Backspace")&&chosen!==null&&!e.target.closest?.("textarea,input")&&!selection.hidden){
  e.preventDefault();$("annotationDeleteSelected").click();
 }
});
window.addEventListener("resize",()=>{
 if(toolbar.style.top)positionPanel(parseFloat(toolbar.style.left)||0,parseFloat(toolbar.style.top)||0);
 resize();
});
window.videoClockAnnotations={close:()=>show(false)};
resize();setMode("text");
})();
