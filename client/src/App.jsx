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

function UsersList({ users, onSelect, onAdd }){
  return (
    <div className="panel users">
      <h3>Users</h3>
      <ul>
        {users.map(u => (
          <li key={u.id}>
            <span onClick={() => onSelect(u)}>{u.username}</span>
            <button onClick={() => onAdd(u.username)}>Add</button>
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
        {friends.map(f => (<li key={f.id} onClick={() => onSelect(f)}>{f.username}</li>))}
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
      <div className="chatHeader">Chat with {peer.username} <button onClick={() => onCall(peer.id)}>Call</button></div>
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
  const [token, setToken] = useState(localStorage.token || null)
  const [me, setMe] = useState(null)
  const [socket, setSocket] = useState(null)
  const [users, setUsers] = useState([])
  const [friends, setFriends] = useState([])
  const [incoming, setIncoming] = useState([])
  const [selected, setSelected] = useState(null)
  const pcRef = useRef(null)

  useEffect(()=>{
    if (!token) return;
    localStorage.token = token
    // fetch my info
    fetch('/api/me', { headers: { 'Authorization': 'Bearer ' + token } }).then(r=>r.json()).then(j=>{ setMe(j.user) })
    // connect socket
    const s = io({ auth: { token } })
    setSocket(s)
    s.on('connect_error', e=>console.error('sock err', e))

    s.on('webrtc-offer', async (data) => {
      const { from, offer } = data
      await startAsReceiver(from, offer, s)
    })

    s.on('webrtc-answer', async (data) => {
      const { answer } = data
      if (pcRef.current) await pcRef.current.setRemoteDescription(answer)
    })

    s.on('webrtc-candidate', async (data) => {
      const { candidate } = data
      if (pcRef.current) pcRef.current.addIceCandidate(candidate).catch(console.error)
    })

    return () => s.close()
  }, [token])

  useEffect(()=>{ if (!token) return; loadUsers(); loadFriends(); }, [token])

  async function onAuth(t, user){ setToken(t); setMe(user) }

  async function loadUsers(){
    const res = await fetch('/api/users', { headers: { 'Authorization': 'Bearer ' + token } })
    const j = await res.json(); setUsers(j.users || [])
  }

  async function loadFriends(){
    const res = await fetch('/api/friends', { headers: { 'Authorization': 'Bearer ' + token } })
    const j = await res.json(); setFriends(j.friends || []); setIncoming(j.incoming || [])
  }

  async function addFriend(username){
    await fetch('/api/friends/add', { method:'POST', headers:{'Content-Type':'application/json', 'Authorization':'Bearer ' + token}, body: JSON.stringify({ username }) })
    loadFriends()
    alert('friend request sent')
  }

  async function acceptFriend(requesterId){
    await fetch('/api/friends/accept', { method:'POST', headers:{'Content-Type':'application/json', 'Authorization':'Bearer ' + token}, body: JSON.stringify({ requesterId }) })
    loadFriends()
  }

  async function startCall(targetId){
    // create peer, get mic, send offer
    const pc = new RTCPeerConnection()
    pcRef.current = pc
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
    stream.getTracks().forEach(t => pc.addTrack(t, stream))
    pc.onicecandidate = (e) => { if (e.candidate) socket.emit('webrtc-candidate', { to: targetId, candidate: e.candidate }) }
    pc.ontrack = (ev) => { console.log('remote track', ev) }
    const offer = await pc.createOffer(); await pc.setLocalDescription(offer)
    socket.emit('webrtc-offer', { to: targetId, offer })
  }

  async function startAsReceiver(from, offer, socket){
    const pc = new RTCPeerConnection()
    pcRef.current = pc
    pc.onicecandidate = (e) => { if (e.candidate) socket.emit('webrtc-candidate', { to: from, candidate: e.candidate }) }
    pc.ontrack = (ev) => { console.log('remote track (recv)', ev) }
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
    stream.getTracks().forEach(t => pc.addTrack(t, stream))
    await pc.setRemoteDescription(offer)
    const answer = await pc.createAnswer(); await pc.setLocalDescription(answer)
    socket.emit('webrtc-answer', { to: from, answer })
  }

  if (!token) return <Auth onAuth={onAuth} />

  return (
    <div className="app">
      <div className="sidebar">
        <UsersList users={users} onSelect={u=>setSelected(u)} onAdd={addFriend} />
        <Friends friends={friends} incoming={incoming} onSelect={u=>setSelected(u)} onAccept={acceptFriend} />
      </div>
      <div className="main">
        {selected ? <Chat socket={socket} me={me} peer={selected} onCall={startCall} /> : <div className="placeholder">Choose a user to start chatting</div>}
      </div>
      <div className="meta">Logged as: {me && me.username}</div>
    </div>
  )
}
