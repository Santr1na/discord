import React, { useEffect, useState, useRef } from 'react'
import io from 'socket.io-client'

function Auth({ onAuth }){
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [msg, setMsg] = useState('')

  async function register(){
    const res = await fetch('/api/register', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ username, password }) })
    const j = await res.json();
    if (j.error) return setMsg(j.error)
    onAuth(j.token, j.user)
  }

  async function login(){
    const res = await fetch('/api/login', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ username, password }) })
    const j = await res.json();
    if (j.error) return setMsg(j.error)
    onAuth(j.token, j.user)
  }

  return (
    <div className="auth">
      <h2>Login / Register</h2>
      <input placeholder="username" value={username} onChange={e=>setUsername(e.target.value)} />
      <input placeholder="password" type="password" value={password} onChange={e=>setPassword(e.target.value)} />
      <div className="row">
        <button onClick={register}>Register</button>
        <button onClick={login}>Login</button>
      </div>
      <div className="msg">{msg}</div>
    </div>
  )
}

function UsersList({ users, onSelect, onAdd, onSearch }){
  const [q, setQ] = React.useState('')
  return (
    <div className="panel users">
      <h3>Find users</h3>
      <div className="searchRow">
        <input placeholder="Search by username" value={q} onChange={e=>setQ(e.target.value)} />
        <button onClick={() => onSearch(q)}>Search</button>
      </div>
      <ul>
        {users.map(u => (
          <li key={u.id}>
            <button className="linkLike" onClick={() => onSelect(u.id)}>{u.username}</button>
            <button className="btn small" onClick={() => onAdd(u.username)}>Add</button>
          </li>
        ))}
      </ul>
    </div>
  )
}

function Friends({ friends, incoming, onSelect, onAccept }){
  return (
    <div className="panel friends">
      <h3>Friends</h3>
      <ul>
        {friends.map(f => (<li key={f.id} onClick={() => onSelect(f.id)}>{f.username}</li>))}
      </ul>
      <h4>Incoming</h4>
      <ul>
        {incoming.map(r => (
          <li key={r.request_id}>{r.requester_username} <button onClick={() => onAccept(r.requester_id)}>Accept</button></li>
        ))}
      </ul>
    </div>
  )
}

function Chat({ socket, me, peer, onCall }){
  const [messages, setMessages] = useState([])
  const [text, setText] = useState('')

  useEffect(()=>{
    if (!socket) return;
    const fn = (m) => {
      // if relevant reload messages
      if ((m.from === peer.id) || (m.to === peer.id)) fetchMessages();
    }
    socket.on('private_message', fn)
    return () => socket.off('private_message', fn)
  }, [socket, peer])

  async function fetchMessages(){
    const res = await fetch('/api/messages/' + peer.id, { headers: { 'Authorization': 'Bearer ' + localStorage.token } })
    const j = await res.json();
    setMessages(j.messages || [])
  }

  useEffect(()=>{ if (peer) fetchMessages() }, [peer])

  function send(){
    if (!text) return;
    socket.emit('private_message', { to: peer.id, content: text })
    setText('')
    fetchMessages()
  }

  return (
    <div className="chat">
      <div className="chatHeader">Chat with {peer.username} <button onClick={() => onCall(peer)}>Call</button></div>
      <div className="messages">
        {messages.map(m => <div key={m.id || m.created_at} className={m.from_id === me.id ? 'msg me' : 'msg them'}>{m.from_id === me.id ? 'You' : peer.username}: {m.content}</div>)}
      </div>
      <div className="composer">
        <input value={text} onChange={e=>setText(e.target.value)} placeholder="Message" />
        <button onClick={send}>Send</button>
      </div>
    </div>
  )
}

export default function App(){
  const API = import.meta.env.VITE_API_BASE || ''
  const [token, setToken] = useState(localStorage.token || null)
  const [me, setMe] = useState(null)
  const [socket, setSocket] = useState(null)
  const [users, setUsers] = useState([])
  const [friends, setFriends] = useState([])
  const [incoming, setIncoming] = useState([])
  const [selected, setSelected] = useState(null)
  const [callActivePeerId, setCallActivePeerId] = useState(null)
  const [callStartTime, setCallStartTime] = useState(null)
  const [callEndTime, setCallEndTime] = useState(null)
  const [incomingCall, setIncomingCall] = useState(null)
  const [outgoingCall, setOutgoingCall] = useState(null)
  const [muted, setMuted] = useState(false)
  const [deafened, setDeafened] = useState(false)
  const pcRef = useRef(null)
  const audioRef = useRef(null)
  const localStreamRef = useRef(null)
  const localVideoRef = useRef(null)
  const remoteVideoRef = useRef(null)

  useEffect(()=>{
    if (!token) return;
    localStorage.token = token
    // fetch my info
    fetch('/api/me', { headers: { 'Authorization': 'Bearer ' + token } }).then(r=>r.json()).then(j=>{ setMe(j.user) })
    // connect socket
    const s = (API && API !== '') ? io(API, { auth: { token } }) : io({ auth: { token } })
    setSocket(s)
    s.on('connect_error', e=>console.error('sock err', e))

    s.on('webrtc-offer', async (data) => {
      console.log('webrtc-offer received:', data)
      const { from, username, offer } = data
      setIncomingCall({ from, username, offer })
    })

    s.on('webrtc-answer', async (data) => {
      const { answer } = data
      if (pcRef.current) await pcRef.current.setRemoteDescription(answer)
    })

    s.on('webrtc-candidate', async (data) => {
      const { candidate } = data
      if (pcRef.current) pcRef.current.addIceCandidate(candidate).catch(console.error)
    })

    s.on('webrtc-hangup', (data) => {
      // the other party hung up
      setCallActivePeerId(null)
      if (pcRef.current){ try { pcRef.current.close() } catch(e){}; pcRef.current = null }
      setCallEndTime(new Date())
      alert('Call ended by other user')
    })

    s.on('webrtc-reject', (data) => {
      setOutgoingCall(null)
      alert('Call rejected')
    })

    s.on('friend_request', (data) => {
      console.log('friend request received', data)
      loadFriends()
    })

    return () => s.close()
  }, [token])

  useEffect(()=>{ if (!token) return; loadUsers(); loadFriends(); }, [token])

  async function onAuth(t, user){ setToken(t); setMe(user) }

  async function loadUsers(q){
    const url = (API || '') + '/api/users' + (q ? ('?search=' + encodeURIComponent(q)) : '')
    const res = await fetch(url, { headers: { 'Authorization': 'Bearer ' + token } })
    const j = await res.json(); setUsers(j.users || [])
  }

  async function loadFriends(){
    const res = await fetch((API || '') + '/api/friends', { headers: { 'Authorization': 'Bearer ' + token } })
    const j = await res.json(); setFriends(j.friends || []); setIncoming(j.incoming || [])
  }

  async function addFriend(username){
    try{
      const res = await fetch((API || '') + '/api/friends/add', { method:'POST', headers:{'Content-Type':'application/json', 'Authorization':'Bearer ' + token}, body: JSON.stringify({ username }) })
      const j = await res.json();
      if (j.error) return alert('Error: ' + j.error)
      loadFriends()
      alert('friend request sent')
    }catch(e){ alert('Network error: could not reach server') }
  }

  async function acceptFriend(requesterId){
    await fetch((API || '') + '/api/friends/accept', { method:'POST', headers:{'Content-Type':'application/json', 'Authorization':'Bearer ' + token}, body: JSON.stringify({ requesterId }) })
    loadFriends()
  }

  async function initiateCall(target){
    console.log('Initiating call to:', target)
    // create peer, get mic, send offer
    const pc = new RTCPeerConnection()
    pcRef.current = pc
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true })
    localStreamRef.current = stream
    if (localVideoRef.current) localVideoRef.current.srcObject = stream
    stream.getTracks().forEach(t => pc.addTrack(t, stream))
    pc.onicecandidate = (e) => { if (e.candidate) socket.emit('webrtc-candidate', { to: target.id, candidate: e.candidate }) }
    pc.ontrack = (ev) => { console.log('remote track received'); if (audioRef.current) { audioRef.current.srcObject = ev.streams[0]; audioRef.current.play().catch(console.error); } if (remoteVideoRef.current) { remoteVideoRef.current.srcObject = ev.streams[0]; remoteVideoRef.current.play().catch(console.error); } }
    const offer = await pc.createOffer(); await pc.setLocalDescription(offer)
    socket.emit('webrtc-offer', { to: target.id, offer })
    setCallActivePeerId(target.id)
    setCallStartTime(new Date())
    setCallEndTime(null)
  }

  useEffect(() => {
    if (outgoingCall && socket) {
      console.log('Initiating call to:', outgoingCall)
      initiateCall(outgoingCall)
    }
  }, [outgoingCall, socket])

  async function startAsReceiver(from, offer, socket){
    const pc = new RTCPeerConnection()
    pcRef.current = pc
    pc.onicecandidate = (e) => { if (e.candidate) socket.emit('webrtc-candidate', { to: from, candidate: e.candidate }) }
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true })
    localStreamRef.current = stream
    if (localVideoRef.current) localVideoRef.current.srcObject = stream
    stream.getTracks().forEach(t => pc.addTrack(t, stream))
    pc.ontrack = (ev) => { console.log('remote track received (receiver)'); if (audioRef.current) { audioRef.current.srcObject = ev.streams[0]; audioRef.current.play().catch(console.error); } if (remoteVideoRef.current) { remoteVideoRef.current.srcObject = ev.streams[0]; remoteVideoRef.current.play().catch(console.error); } }
    await pc.setRemoteDescription(offer)
    const answer = await pc.createAnswer(); await pc.setLocalDescription(answer)
    socket.emit('webrtc-answer', { to: from, answer })
    setCallStartTime(new Date())
    setCallEndTime(null)
  }

  async function acceptCall(){
    console.log('accepting call')
    if (!incomingCall) return;
    const { from, offer } = incomingCall;
    setIncomingCall(null);
    setCallActivePeerId(from);
    setCallStartTime(new Date());
    setCallEndTime(null);
    await startAsReceiver(from, offer, socket);
  }

  function rejectCall(){
    console.log('rejecting call')
    if (!incomingCall) return;
    socket.emit('webrtc-reject', { to: incomingCall.from });
    setIncomingCall(null);
  }

  function toggleMute(){
    if (localStreamRef.current) {
      const track = localStreamRef.current.getAudioTracks()[0]
      if (track) {
        track.enabled = !track.enabled
        setMuted(!muted)
      }
    }
  }

  function toggleDeafen(){
    const newDeafened = !deafened
    setDeafened(newDeafened)
    if (audioRef.current) {
      audioRef.current.volume = newDeafened ? 0 : 1
    }
  }

  function hangup(){
    if (pcRef.current){ try { pcRef.current.close() } catch(e){}; pcRef.current = null }
    if (callActivePeerId && socket) socket.emit('webrtc-hangup', { to: callActivePeerId })
    setCallActivePeerId(null)
    setCallEndTime(new Date())
    setMuted(false)
    setDeafened(false)
    localStreamRef.current = null
    if (localVideoRef.current) localVideoRef.current.srcObject = null
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null
  }

  if (!token) return <Auth onAuth={onAuth} />

  return (
    <div className="app">
      <audio ref={audioRef} autoPlay />
      <video ref={localVideoRef} autoPlay muted style={{ display: callActivePeerId ? 'block' : 'none', width: '200px', height: '150px' }} />
      <video ref={remoteVideoRef} autoPlay style={{ display: callActivePeerId ? 'block' : 'none', width: '200px', height: '150px' }} />
      {incomingCall && (
        <div className="modal">
          {console.log('rendering modal for', incomingCall.username)}
          <div className="modalContent">
            <h3>Incoming call from {incomingCall.username}</h3>
            <button className="btn" onClick={acceptCall}>Accept</button>
            <button className="btn danger" onClick={rejectCall}>Reject</button>
          </div>
        </div>
      )}
      {outgoingCall && (
        <div className="modal">
          <div className="modalContent">
            <h3>Calling {outgoingCall.username}...</h3>
            <button className="btn danger" onClick={() => setOutgoingCall(null)}>Cancel</button>
          </div>
        </div>
      )}
      <div className="sidebar">
        <UsersList users={users} onSelect={setSelected} onAdd={addFriend} onSearch={loadUsers} />
        <Friends friends={friends} incoming={incoming} onSelect={setSelected} onAccept={acceptFriend} />
      </div>
      <div className="main">
        <div className="topBar">
            <div className="status">{selected ? `Currently chatting with: ${friends.find(f => f.id === selected)?.username || users.find(u => u.id === selected)?.username || 'Unknown'}` : 'No user selected'}</div>
            <div className="callStatus">{callActivePeerId ? 'In call' : 'Not in call'}</div>
            {callStartTime && <div>Call started at: {callStartTime.toLocaleTimeString()}</div>}
            {callEndTime && <div>Call ended at: {callEndTime.toLocaleTimeString()}</div>}
            {callActivePeerId && (
              <>
                <button className="btn" onClick={toggleMute}>{muted ? 'Unmute' : 'Mute'}</button>
                <button className="btn" onClick={toggleDeafen}>{deafened ? 'Undeafen' : 'Deafen'}</button>
                <button className="btn danger" onClick={hangup}>Hang Up</button>
              </>
            )}
          </div>
        {(() => {
          const peer = friends.find(f => f.id === selected) || users.find(u => u.id === selected);
          return peer ? <Chat socket={socket} me={me} peer={peer} onCall={(peerData) => {
            console.log('Call button clicked for:', peerData)
            setOutgoingCall(peerData)
          }} onHangup={hangup} /> : <div className="placeholder">Choose a user to start chatting</div>;
        })()}
      </div>
      <div className="meta">Logged as: {me && me.username}</div>
    </div>
  )
}
