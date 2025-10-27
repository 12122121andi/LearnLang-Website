// translator-fix.js - kinda messy version

function isWs(n){return n&&n.nodeType===Node.TEXT_NODE&&/^\s+$/.test(n.nodeValue)}
function isWord(n){return n&&n.nodeType===Node.ELEMENT_NODE&&n.classList?.contains("word")}

function getNodesBetw(a,b){
  const arr=[];let x=a;
  while(x){arr.push(x);if(x===b)break;x=x.nextSibling;}
  return arr
}

function getTxtBetw(a,b){
  const nodes=getNodesBetw(a,b)
  const parts=nodes.map(n=>{
    if(isWord(n))return n.dataset.original??n.textContent
    if(n.nodeType===Node.TEXT_NODE)return n.nodeValue
    return n.textContent
  })
  return parts.join("")
}

function replRangeWithFrag(start,end,frag){
  const p=start.parentNode;const after=end.nextSibling
  let n=start
  while(n&&n!==after){
    const nxt=n.nextSibling
    n.remove()
    n=nxt
  }
  p.insertBefore(frag,after)
}

function wrapWords(n){
  if(n.nodeType===Node.TEXT_NODE){
    const t=n.nodeValue
    if(!t.trim())return
    const f=document.createDocumentFragment()
    const bits=t.split(/(\s+)/)
    bits.forEach(p=>{
      if(p==="")return
      if(/\s+/.test(p)){f.appendChild(document.createTextNode(p))}
      else{
        const s=document.createElement("span")
        s.className="word"
        s.textContent=p
        s.dataset.original=p
        f.appendChild(s)
      }
    })
    n.replaceWith(f)
  }else if(n.nodeType===Node.ELEMENT_NODE){
    if(["SCRIPT","STYLE"].includes(n.tagName))return
    Array.from(n.childNodes).forEach(wrapWords)
  }
}

function collectClust(el,mode){
  const ok=(x)=>isWord(x)&&x.classList.contains("translated")
  const left=[],right=[]
  let n=el.previousSibling
  while(n){
    if(isWs(n)){left.push(n);n=n.previousSibling;continue}
    if((mode==="translate"||mode==="restore")&&ok(n)){left.push(n);n=n.previousSibling;continue}
    break
  }
  n=el.nextSibling
  while(n){
    if(isWs(n)){right.push(n);n=n.nextSibling;continue}
    if((mode==="translate"||mode==="restore")&&ok(n)){right.push(n);n=n.nextSibling;continue}
    break
  }
  const lWords=left.filter(isWord).reverse()
  const lWs=left.filter(isWs).reverse()
  const rWords=right.filter(isWord)
  const rWs=right.filter(isWs)
  return {words:[...lWords,el,...rWords],spaces:[...lWs,...rWs]}
}

async function translateClust(span){
  const {words,spaces}=collectClust(span,"translate")
  if(words.some(w=>w.dataset.busy==="true"))return
  const first=words[0]
  first.dataset.busy="true"
  try{
    const last=words.at(-1)
    const allTxt=getTxtBetw(first,last)
    const res=await fetch("https://lucky-laser-ka-easier.trycloudflare.com/api/translate",{
      method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({name:allTxt,lang:"fr"})
    })
    const data=await res.json()
    const nodes=getNodesBetw(first,last)
    for(let i=1;i<nodes.length;i++){
      const m=nodes[i]
      if(m&&m.parentNode)m.remove()
    }
    first.dataset.original=allTxt
    first.dataset.translation=data.message??""
    first.textContent=`${data.message??""} ← ${allTxt}`
    first.classList.add("translated")
  }catch(e){console.error("oops translate err:",e)}
  finally{first.dataset.busy="false"}
}

function restoreClust(span){
  const {words}=collectClust(span,"restore")
  if(words.some(w=>w.dataset.busy==="true"))return
  const a=words[0],b=words.at(-1)
  a.dataset.busy="true"
  try{
    const txt=getTxtBetw(a,b)
    const f=document.createDocumentFragment()
    const bits=txt.split(/(\s+)/)
    bits.forEach(p=>{
      if(p==="")return
      if(/\s+/.test(p)){f.appendChild(document.createTextNode(p))}
      else{
        const s=document.createElement("span")
        s.className="word"
        s.textContent=p
        s.dataset.original=p
        setupWordEv(s)
        f.appendChild(s)
      }
    })
    replRangeWithFrag(a,b,f)
  }catch(e){console.error("restore err:",e)}
  finally{
    const maybe=a.previousSibling&&isWord(a.previousSibling)?a.previousSibling:(a.nextSibling&&isWord(a.nextSibling)?a.nextSibling:null)
    if(maybe)maybe.dataset.busy="false"
  }
}

async function toggleTrans(span){
  if(span.dataset.busy==="true")return
  if(!span.classList.contains("translated"))await translateClust(span)
  else restoreClust(span)
}

function setupWordEv(s){s.addEventListener("click",()=>toggleTrans(s))}

function initTrans(){
  wrapWords(document.body)
  document.querySelectorAll(".word").forEach(setupWordEv)
}

initTrans()
