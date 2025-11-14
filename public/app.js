let token = null;
let me = null;
let socket = null;
let currentChatUser = null;
let pc = null;

const el = (id) => document.getElementById(id);

async function request(path, opts = {}){
  const headers = opts.headers || {};
  if (token) headers['Authorization'] = 'Bearer ' + token;
  console.log('[client] api request', { path: '/api' + path, hasToken: !!token });
  try {
    const res = await fetch('/api' + path, { headers, ...opts });
    const body = await res.json().catch(() => null);
    console.log('[client] api response', { path: '/api' + path, status: res.status, body });
    return body;
  } catch (err) {
    console.error('[client] api fetch error', { path: '/api' + path, err: err && err.message });
    throw err;
  }
}

el('btnRegister').onclick = async () => {
  const username = el('username').value;
  const password = el('password').value;
  console.log('[client] register submit', { username });
  try {
    const r = await fetch('/api/register', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ username, password }) });
    const body = await r.json().catch(()=>null);
    console.log('[client] register response', { status: r.status, body });
    if (!body) return el('authMsg').innerText = 'No response body from server';
    if (body.error) return el('authMsg').innerText = body.error;
    token = body.token; me = body.user; afterLogin();
  } catch (err) {
    console.error('[client] register error', err);
    el('authMsg').innerText = 'Network error: cannot reach server';
  }
};

el('btnLogin').onclick = async () => {
  const username = el('username').value;
  const password = el('password').value;
  console.log('[client] login submit', { username });
  try {
    const r = await fetch('/api/login', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ username, password }) });
    const body = await r.json().catch(()=>null);
    console.log('[client] login response', { status: r.status, body });
    if (!body) return el('authMsg').innerText = 'No response body from server';
    if (body.error) return el('authMsg').innerText = body.error;
    token = body.token; me = body.user; afterLogin();
  } catch (err) {
    console.error('[client] login error', err);
    el('authMsg').innerText = 'Network error: cannot reach server';
  }
};

async function afterLogin(){
  el('auth').style.display = 'none';
  el('main').style.display = 'flex';
  el('me').innerText = me.username;
  connectSocket();
  loadUsers();
}

async function loadUsers(){
  const res = await request('/users');
  const ul = el('users'); ul.innerHTML = '';
  for (const u of res.users){
    const li = document.createElement('li'); li.innerText = u.username; li.dataset.id = u.id;
    li.onclick = () => selectUser(u);
    ul.appendChild(li);
  }
}

async function loadFriends(){
  const res = await request('/friends');
  const ul = el('friends'); ul.innerHTML = '';
  for (const f of res.friends){
    const otherId = f.requester === me.id ? f.addressee : f.requester;
    const otherUser = f.other_username || ('id:'+otherId);
    const li = document.createElement('li'); li.innerText = otherUser + ' (' + f.status + ')'; li.dataset.id = otherId;
    li.onclick = () => selectUser({ id: otherId, username: otherUser });
    ul.appendChild(li);
  }
}

function selectUser(u){
  currentChatUser = u;
  el('chatHeader').innerText = 'Chat with ' + u.username;
  loadMessages(u.id);
}

async function loadMessages(withId){
  const res = await request('/messages/' + withId);
  const box = el('messages'); box.innerHTML = '';
  for (const m of res.messages){
    const d = document.createElement('div'); d.innerText = (m.from_id === me.id ? 'You: ' : m.from_id + ': ') + m.content; box.appendChild(d);
  }
  box.scrollTop = box.scrollHeight;
}

el('sendBtn').onclick = async () => {
  const content = el('msgInput').value;
  if (!currentChatUser) return alert('select a user');
  socket.emit('private_message', { to: currentChatUser.id, content });
  el('msgInput').value = '';
};

el('callBtn').onclick = async () => {
  if (!currentChatUser) return alert('select a user');
  startCall(currentChatUser.id);
};

function connectSocket(){
  console.log('[client] connecting socket, hasToken=', !!token);
  socket = io({ auth: { token } });
  socket.on('connect', () => console.log('[client] socket connected', { id: socket.id }));
  socket.on('disconnect', (reason) => console.log('[client] socket disconnected', reason));
  socket.on('connect_error', (err) => { console.error('[client] socket connect_error', err); });
  socket.on('private_message', (m) => {
    if (currentChatUser && (m.from === currentChatUser.id || m.to === currentChatUser.id)) loadMessages(currentChatUser.id);
  });

  // WebRTC signaling
  socket.on('webrtc-offer', async (data) => {
    const { from, offer } = data;
    await startPeerAsReceiver(from, offer);
  });

  socket.on('webrtc-answer', async (data) => {
    const { from, answer } = data;
    if (pc){ await pc.setRemoteDescription(answer); }
  });

  socket.on('webrtc-candidate', async (data) => {
    const { candidate } = data;
    if (pc) pc.addIceCandidate(candidate).catch(console.error);
  });

  socket.on('webrtc-hangup', (data) => {
    console.log('[client] webrtc-hangup received', data);
    if (pc){ try { pc.close() } catch(e){}; pc = null }
    alert('Call ended by the other user');
  });

  loadFriends();
}

async function startCall(targetId){
  pc = new RTCPeerConnection();
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
  stream.getTracks().forEach(t => pc.addTrack(t, stream));
  pc.onicecandidate = (e) => { if (e.candidate) socket.emit('webrtc-candidate', { to: targetId, candidate: e.candidate }); };
  pc.ontrack = (ev) => { console.log('incoming track', ev); }
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  socket.emit('webrtc-offer', { to: targetId, offer });
}

async function startPeerAsReceiver(from, offer){
  pc = new RTCPeerConnection();
  pc.onicecandidate = (e) => { if (e.candidate) socket.emit('webrtc-candidate', { to: from, candidate: e.candidate }); };
  pc.ontrack = (ev) => { console.log('remote audio', ev); };
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
  stream.getTracks().forEach(t => pc.addTrack(t, stream));
  await pc.setRemoteDescription(offer);
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  socket.emit('webrtc-answer', { to: from, answer });
}
