// Shared Library UI. Kept independent from the active chat workspace/session.
const library = { selectedProjectId: null, folder: '.', projectPages: [], projectNext: null, entryPages: [], entryNext: null, previewSelection: null, generation: 0 };
let _libraryQuery = '', _librarySearchTimer = null;
let _libraryProjectMoreLoading = false;
const _lib$ = id => document.getElementById(id);
const _libT = (key, fallback) => typeof t === 'function' ? (t(key) || fallback) : fallback;
const _libUrl = (path, params = {}) => { const u = new URL(path.replace(/^\/+/, ''), document.baseURI); Object.entries(params).forEach(([k,v]) => u.searchParams.set(k, v)); return u.href; };
const _libErr = e => e && (e.message || e.error) || 'Library request failed';
const _libStatus = (id, text, error = false) => { const el = _lib$(id); if (el) { el.textContent = text || ''; el.classList.toggle('is-error', !!error); } };
async function _libraryApi(url, options) { try { return await api(url, options); } catch (e) { throw new Error(_libErr(e)); } }
async function _libraryPost(path, body) { return _libraryApi(path, {method:'POST', body:JSON.stringify(body)}); }
function _libraryCloseDrawer() { if (typeof closeMobileSidebar === 'function' && window.matchMedia('(max-width: 767px)').matches) closeMobileSidebar(); }
function _syncLibraryActions(){document.querySelectorAll('.library-requires-project').forEach(button=>{button.disabled=!library.selectedProjectId;});}
function searchLibraryProjects(value) { _libraryQuery = value || ''; clearTimeout(_librarySearchTimer); _librarySearchTimer = setTimeout(() => loadLibrary(), 180); }
async function loadLibrary() {
  const gen = ++library.generation, list = _lib$('libraryProjectList');
  if (!list) return;
  const retry=_lib$('libraryProjectRetry');if(retry)retry.hidden=true;
  if (!library.projectPages.length) _libStatus('libraryProjectStatus', _libT('library_loading', 'Loading projects…'));
  try {
    const data = await _libraryApi(_libUrl('/api/library/projects', {q:_libraryQuery,offset:0,limit:100}));
    if (gen !== library.generation) return;
    library.projectPages = [ ...(data.projects || []) ]; library.projectNext = data.next_offset;
    _renderLibraryProjects();
    _libStatus('libraryProjectStatus', library.projectPages.length ? '' : _libT('library_empty', 'Create your first project'));
    const more = _lib$('libraryProjectMore'); if (more) more.hidden = library.projectNext == null;
    if (library.selectedProjectId && !library.projectPages.some(p => p.project_id === library.selectedProjectId)) {
      library.selectedProjectId = null; library.folder = '.'; library.entryPages = []; library.previewSelection = null; closeLibraryPreview(); _renderLibraryEntries();
    }
    _syncLibraryActions();
    if (library.selectedProjectId) await loadLibraryDirectory(library.folder, {append:false});
    else _libStatus('libraryMainStatus', _libT('library_select_project', 'Select a project to browse its files.'));
  } catch (e) { if (gen === library.generation) { _libStatus('libraryProjectStatus', _libErr(e), true); if(retry)retry.hidden=false; } }
}
function _renderLibraryProjects() {
  const list = _lib$('libraryProjectList'); if (!list) return; list.replaceChildren();
  library.projectPages.forEach(project => {
    const li = document.createElement('li'); li.className = 'library-project-item';
    const select = document.createElement('button'); select.type='button'; select.className='library-project-select'; select.textContent=project.name; select.setAttribute('aria-current', project.project_id===library.selectedProjectId?'true':'false');
    select.addEventListener('click', () => openLibraryProject(project.project_id)); li.append(select);
    const actions=document.createElement('div'); actions.className='library-project-actions';
    for (const [label, fn] of [[_libT('library_rename','Rename'),()=>renameLibraryProject(project)],[_libT('library_delete','Delete'),()=>deleteLibraryProject(project)]]) { const b=document.createElement('button'); b.type='button'; b.textContent=label; b.addEventListener('click',fn); actions.append(b); }
    li.append(actions); list.append(li);
  });
}
async function loadMoreLibraryProjects() {
  if (library.projectNext == null || _libraryProjectMoreLoading) return;
  _libraryProjectMoreLoading = true;
  const gen=library.generation, offset=library.projectNext;
  try { const data=await _libraryApi(_libUrl('/api/library/projects',{q:_libraryQuery,offset,limit:100})); if(gen!==library.generation)return; library.projectPages.push(...(data.projects||[])); library.projectNext=data.next_offset; _renderLibraryProjects(); _lib$('libraryProjectMore').hidden=library.projectNext==null; }
  catch(e){_libStatus('libraryProjectStatus',_libErr(e),true);}
  finally { _libraryProjectMoreLoading=false; }
}
async function openLibraryProject(projectId) {
  library.selectedProjectId=projectId; library.folder='.'; library.entryPages=[]; library.entryNext=null; library.previewSelection=null; closeLibraryPreview(); ++library.generation;
  _syncLibraryActions(); _libraryCloseDrawer(); _renderLibraryProjects(); await loadLibraryDirectory('.', {append:false});
}
function _libraryPathJoin(a,b) { return !a || a==='.' ? b : `${a}/${b}`; }
async function loadLibraryDirectory(path='.', {append=false}={}) {
  const pid=library.selectedProjectId; if(!pid)return;
  if(!append){library.folder=path||'.';library.entryPages=[];library.entryNext=null;library.previewSelection=null;closeLibraryPreview();}
  const folder=library.folder, gen=++library.generation, offset=append?(library.entryNext||0):0;
  const retry=_lib$('libraryMainRetry');if(retry)retry.hidden=true;
  _libStatus('libraryMainStatus',_libT('library_loading','Loading…'));
  try {
    const data=await _libraryApi(_libUrl('/api/library/list',{project_id:pid,path:folder,offset,limit:200}));
    if(gen!==library.generation||pid!==library.selectedProjectId||folder!==library.folder)return;
    library.entryPages=append?library.entryPages.concat(data.entries||[]):(data.entries||[]);library.entryNext=data.next_offset;
    _renderLibraryEntries();_renderLibraryBreadcrumbs();_libStatus('libraryMainStatus',library.entryPages.length?'':_libT('library_folder_empty','This folder is empty.'));
    const more=_lib$('libraryEntryMore');if(more)more.hidden=library.entryNext==null;
  }catch(e){if(gen===library.generation){_libStatus('libraryMainStatus',_libErr(e),true);if(retry)retry.hidden=false;}}
}
async function loadMoreLibraryEntries(){return loadLibraryDirectory(library.folder,{append:true});}
function _renderLibraryBreadcrumbs(){
  const nav=_lib$('libraryBreadcrumbs');if(!nav)return;nav.replaceChildren();
  const project=library.projectPages.find(p=>p.project_id===library.selectedProjectId);const root=document.createElement('button');root.type='button';root.textContent=project?project.name:_libT('library_project','Project');root.addEventListener('click',()=>loadLibraryDirectory('.',{append:false}));nav.append(root);
  let path='.';for(const part of library.folder.split('/').filter(x=>x&&x!=='.')){path=_libraryPathJoin(path,part);const p=path,b=document.createElement('button');b.type='button';b.textContent=part;b.addEventListener('click',()=>loadLibraryDirectory(p,{append:false}));nav.append(document.createTextNode(' / '),b);}
}
function _renderLibraryEntries(){
 const container=_lib$('libraryEntries');if(!container)return;container.replaceChildren();
 library.entryPages.forEach(entry=>{
  const row=document.createElement('div');row.className='library-entry';row.setAttribute('role','listitem');
  const unavailable=entry.unavailable||entry.type==='unavailable'||entry.type==='symlink', isDir=entry.is_dir||entry.type==='dir';
  const open=document.createElement('button');open.type='button';open.className='library-entry-name';open.textContent=(isDir?'▸ ':'')+entry.name+(unavailable?' (unavailable)':'');
  if(isDir&&!unavailable)open.addEventListener('click',()=>loadLibraryDirectory(_libraryPathJoin(library.folder,entry.name),{append:false}));else if(!isDir&&!unavailable)open.addEventListener('click',()=>previewLibraryFile(_libraryPathJoin(library.folder,entry.name)));
  row.append(open);const actions=document.createElement('div');actions.className='library-entry-actions';
  if(!unavailable){
   if(!isDir){const prev=document.createElement('button');prev.type='button';prev.textContent=_libT('library_preview','Preview');prev.addEventListener('click',()=>previewLibraryFile(_libraryPathJoin(library.folder,entry.name)));actions.append(prev);const dl=document.createElement('a');dl.textContent=_libT('library_download','Download');dl.href=_libUrl('/api/library/file/raw',{project_id:library.selectedProjectId,path:_libraryPathJoin(library.folder,entry.name),download:'1'});actions.append(dl);}
   for(const [text,fn] of [[_libT('library_rename_move','Rename / Move'),()=>renameLibraryEntry(entry)],[_libT('library_delete','Delete'),()=>deleteLibraryEntry(entry)]]){const b=document.createElement('button');b.type='button';b.textContent=text;b.addEventListener('click',fn);actions.append(b);}
  }
  row.append(actions);container.append(row);
 });
}
async function _libraryPromptSubmit(options, submit) {
 let value=options.value||'';
 while(true){
  const entered=await showPromptDialog({...options,value});
  if(entered==null)return false;
  if(!entered.trim()){showToast(_libT('library_value_required','A value is required'),4000,'error');continue;}
  try{await submit(entered.trim());return true;}
  catch(e){value=entered;showToast(_libErr(e),5000,'error');}
 }
}
async function createLibraryProject(){
 _libraryCloseDrawer();const ok=await _libraryPromptSubmit({title:_libT('library_create_project','New project'),message:_libT('library_shared_hint','Shared across all profiles on this WebUI.'),placeholder:_libT('library_project_name','Project name'),confirmLabel:_libT('library_create','Create')},async name=>{const d=await _libraryPost('/api/library/projects/create',{name});library.selectedProjectId=d.project.project_id;library.folder='.';library.entryPages=[];await loadLibrary();});return ok;
}
async function renameLibraryProject(project){return _libraryPromptSubmit({title:_libT('library_rename_project','Rename project'),value:project.name,confirmLabel:_libT('library_save','Save')},async name=>{await _libraryPost('/api/library/projects/rename',{project_id:project.project_id,name});await loadLibrary();});}
async function deleteLibraryProject(project){const ok=await showConfirmDialog({title:`${_libT('library_delete_project','Delete project')} “${project.name}”?`,message:_libT('library_delete_project_warning','Its files will be deleted for every profile.'),confirmLabel:_libT('library_delete','Delete'),danger:true,focusCancel:true});if(!ok)return;try{await _libraryPost('/api/library/projects/delete',{project_id:project.project_id,recursive:true});if(library.selectedProjectId===project.project_id){library.selectedProjectId=null;library.folder='.';library.entryPages=[];library.previewSelection=null;closeLibraryPreview();_renderLibraryEntries();_syncLibraryActions();}await loadLibrary();}catch(e){showToast(_libErr(e),5000,'error');}}
async function createLibraryFolder(){return _libraryPromptSubmit({title:_libT('library_new_folder','New folder'),placeholder:_libT('library_folder_name','Folder name'),confirmLabel:_libT('library_create','Create')},async name=>{await _libraryPost('/api/library/file/create-dir',{project_id:library.selectedProjectId,path:_libraryPathJoin(library.folder,name)});await loadLibraryDirectory(library.folder,{append:false});});}
async function renameLibraryEntry(entry){const old=_libraryPathJoin(library.folder,entry.name);return _libraryPromptSubmit({title:_libT('library_move_prompt','Destination path within this project'),value:old,placeholder:'Folder/name',confirmLabel:_libT('library_save','Save')},async dest=>{if(dest===old)return;await _libraryPost('/api/library/file/rename',{project_id:library.selectedProjectId,path:old,new_path:dest});await loadLibraryDirectory(library.folder,{append:false});});}
async function deleteLibraryEntry(entry){const path=_libraryPathJoin(library.folder,entry.name),dir=entry.is_dir||entry.type==='dir';const ok=await showConfirmDialog({title:`${_libT('library_delete','Delete')} “${entry.name}”?`,message:dir?_libT('library_recursive_warning','All files in this folder will be deleted.'): '',confirmLabel:_libT('library_delete','Delete'),danger:true,focusCancel:true});if(!ok)return;try{await _libraryPost('/api/library/file/delete',{project_id:library.selectedProjectId,path,...(dir?{recursive:true}:{})});if(library.previewSelection===path)closeLibraryPreview();await loadLibraryDirectory(library.folder,{append:false});}catch(e){showToast(_libErr(e),5000,'error');}}
function _libraryRaw(path){return _libUrl('/api/library/file/raw',{project_id:library.selectedProjectId,path});}
function _libraryDownloadLink(path,pid){const link=document.createElement('a');link.href=_libUrl('/api/library/file/raw',{project_id:pid,path,download:'1'});link.textContent=_libT('library_download','Download');return link;}
async function previewLibraryFile(path){
 const pid=library.selectedProjectId;library.previewSelection=path;const pane=_lib$('libraryPreview'),box=_lib$('libraryPreviewPane');if(!pane)return;pane.replaceChildren();box.classList.add('has-preview');const ext=path.split('.').pop().toLowerCase(),raw=_libraryRaw(path);
 if(['png','jpg','jpeg','gif','webp','bmp'].includes(ext)){const img=document.createElement('img');img.src=raw;img.alt=path.split('/').pop();pane.append(img,_libraryDownloadLink(path,pid));return;}
 if(ext==='pdf'){const frame=document.createElement('iframe');frame.src=raw;frame.title=path.split('/').pop();frame.setAttribute('sandbox','');pane.append(frame,_libraryDownloadLink(path,pid));return;}
 if(['mp3','wav','ogg','m4a','aac','flac'].includes(ext)){const audio=document.createElement('audio');audio.controls=true;audio.src=raw;audio.setAttribute('aria-label',path.split('/').pop());pane.append(audio,_libraryDownloadLink(path,pid));return;}
 if(['mp4','webm','ogv'].includes(ext)){const video=document.createElement('video');video.controls=true;video.src=raw;video.setAttribute('aria-label',path.split('/').pop());pane.append(video,_libraryDownloadLink(path,pid));return;}
 const textExt=['txt','md','markdown','csv','tsv','html','htm','xml','json','yaml','yml','toml','log','py','js','ts','css','sh','rst','docx','xlsx','pptx'];
 if(textExt.includes(ext)){
  try{const data=await _libraryApi(_libUrl('/api/library/file',{project_id:pid,path}));if(library.previewSelection!==path||library.selectedProjectId!==pid)return;const text=document.createElement('pre');text.className='library-text-preview';text.textContent=data.content||data.text||'';pane.append(text);}
  catch(e){if(library.previewSelection!==path||library.selectedProjectId!==pid)return;const msg=document.createElement('p');msg.textContent=_libErr(e);pane.append(msg);}
 }
 if(library.previewSelection!==path||library.selectedProjectId!==pid)return;
 pane.append(_libraryDownloadLink(path,pid));
}
function closeLibraryPreview(){library.previewSelection=null;const pane=_lib$('libraryPreview'),box=_lib$('libraryPreviewPane');if(pane)pane.replaceChildren();if(box)box.classList.remove('has-preview');}
async function uploadToLibrary(file,relativeDirectory='.',projectId=library.selectedProjectId){
 const form=new FormData();form.append('project_id',projectId);form.append('path',relativeDirectory||'.');form.append('file',file,file.name);
 try{const result=await _libraryApi('/api/library/upload',{method:'POST',body:form,headers:{},timeoutMs:120000});if(result&&result.error)throw new Error(result.error);if(result&&(result.extract_error||(result.files||[]).some(f=>f.extract_error)))throw new Error(result.extract_error||(result.files.find(f=>f.extract_error)||{}).extract_error);return true;}catch(e){showToast(`${file.name}: ${_libErr(e)}`,5000,'error');return false;}
}
async function _libraryUploadFiles(files){
 const pid=library.selectedProjectId,dest=library.folder;
 if(!pid)return;
 let failed=0;
 for(const {file,relDir} of files){
  const path=typeof _targetDirForRelDir==='function'?_targetDirForRelDir(dest,relDir):_libraryPathJoin(dest,relDir||'');
  if(!await uploadToLibrary(file,path,pid))failed++;
 }
 if(library.selectedProjectId!==pid||library.folder!==dest)return;
 await loadLibraryDirectory(dest,{append:false});
 if(!failed)showToast(_libT('library_upload_complete','Upload complete'));
 else _libStatus('libraryMainStatus',`${failed} upload(s) failed`,true);
}
function _libraryInputUploads(input){const files=[...input.files].map(file=>({file,relDir:file.webkitRelativePath?file.webkitRelativePath.split('/').slice(0,-1).join('/'):''}));input.value='';_libraryUploadFiles(files);}
async function _libraryDrop(e){e.preventDefault();const target=_lib$('libraryEntries');target.classList.remove('drag-over');let uploads=[];if(typeof _collectOsDropUploads==='function')uploads=await _collectOsDropUploads(e.dataTransfer);else uploads=[...e.dataTransfer.files].map(file=>({file,relDir:''}));await _libraryUploadFiles(uploads);}
async function mentionLibraryProjectInChat(){
 const pid=library.selectedProjectId;if(!pid)return;const composer=document.getElementById('msg'),start=composer&&Number.isInteger(composer.selectionStart)?composer.selectionStart:undefined,end=composer&&Number.isInteger(composer.selectionEnd)?composer.selectionEnd:undefined;
 const state=typeof S!=='undefined'?S:null,draft=composer&&composer.value,session=state&&state.session?state.session.session_id:null,profile=state&&state.activeProfile||'default',profileGeneration=typeof _profileSwitchGeneration==='number'?_profileSwitchGeneration:null;
 try{const d=await _libraryApi(_libUrl('/api/library/reference',{project_id:pid}));const current=typeof S!=='undefined'?S:null;if(composer&&composer.value!==draft||(current&&current.session?current.session.session_id:null)!==session||(current&&current.activeProfile||'default')!==profile||profileGeneration!==null&&profileGeneration!==_profileSwitchGeneration)return;const switched=await switchPanel('chat');if(switched&&typeof insertLibraryReference==='function')insertLibraryReference(d.reference,start,end);else if(switched)showToast(_libT('library_unavailable','Library reference unavailable'),4000,'error');}catch(e){showToast(_libErr(e),5000,'error');}
}
document.addEventListener('DOMContentLoaded',()=>{
 const f=_lib$('libraryFileInput'),d=_lib$('libraryFolderInput');if(f)f.addEventListener('change',()=>_libraryInputUploads(f));if(d)d.addEventListener('change',()=>_libraryInputUploads(d));
 const entries=_lib$('libraryEntries');if(entries){entries.addEventListener('dragover',e=>{e.preventDefault();entries.classList.add('drag-over');});entries.addEventListener('dragleave',()=>entries.classList.remove('drag-over'));entries.addEventListener('drop',_libraryDrop);}
});
