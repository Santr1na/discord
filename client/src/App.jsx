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
      <h2>Discord Clone - Login / Register</h2>
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

function ServerList({ servers, selectedServerId, onSelect, onCreate }){
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')

  async function create(){
    if (!newName) return;
    await onCreate(newName)
    setNewName('')
    setShowCreate(false)
  }

  return (
    <div className="serverList">
      <h3>Servers</h3>
      <ul>
        {servers.map(s => (
          <li key={s.id} className={selectedServerId === s.id ? 'active' : ''} onClick={() => onSelect(s)}>
            {s.name.substring(0, 2).toUpperCase()}
          </li>
        ))}
      </ul>
      {showCreate ? (
        <div className="createForm">
          <input placeholder="Server name" value={newName} onChange={e=>setNewName(e.target.value)} />
          <button onClick={create}>Create</button>
          <button onClick={() => setShowCreate(false)}>Cancel</button>
        </div>
      ) : (
        <button onClick={() => setShowCreate(true)}>+</button>
      )}
    </div>
  )
}

function ChannelList({ channels, selectedChannelId, onSelect, onCreate, isOwner, onInvite, onJoinByCode, onShowFriends }){
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [channelType, setChannelType] = useState('text')
  const [showJoin, setShowJoin] = useState(false)
  const [joinCode, setJoinCode] = useState('')

  async function create(){
    if (!newName) return;
    await onCreate(newName, channelType)
    setNewName('')
    setShowCreate(false)
  }

  async function joinServer(){
    if (!joinCode) return;
    await onJoinByCode(joinCode)
    setJoinCode('')
    setShowJoin(false)
  }

  const textChannels = channels.filter(c => c.type === 'text')
  const voiceChannels = channels.filter(c => c.type === 'voice')

  return (
    <div className="channelList">
      <div className="serverActions">
        <button onClick={onInvite} className="inviteBtn">Invite</button>
        <button onClick={() => setShowJoin(!showJoin)} className="joinBtn">Join Server</button>
        <button onClick={onShowFriends} className="friendsBtn">Friends</button>
      </div>
      
      {showJoin && (
        <div className="joinForm">
          <input placeholder="Invite code" value={joinCode} onChange={e=>setJoinCode(e.target.value)} />
          <button onClick={joinServer}>Join</button>
        </div>
      )}

      <h4>TEXT CHANNELS</h4>
      <ul>
        {textChannels.map(c => (
          <li key={c.id} className={selectedChannelId === c.id ? 'active' : ''} onClick={() => onSelect(c)}>
            # {c.name}
          </li>
        ))}
      </ul>

      <h4>VOICE CHANNELS</h4>
      <ul>
        {voiceChannels.map(c => (
          <li key={c.id} className={selectedChannelId === c.id ? 'active' : ''} onClick={() => onSelect(c)}>
            🔊 {c.name}
          </li>
        ))}
      </ul>

      {isOwner && (
        showCreate ? (
          <div className="createForm">
            <input placeholder="Channel name" value={newName} onChange={e=>setNewName(e.target.value)} />
            <select value={channelType} onChange={e=>setChannelType(e.target.value)}>
              <option value="text">Text</option>
              <option value="voice">Voice</option>
            </select>
            <button onClick={create}>Create</button>
            <button onClick={() => setShowCreate(false)}>Cancel</button>
          </div>
        ) : (
          <button onClick={() => setShowCreate(true)}>+ New Channel</button>
        )
      )}
    </div>
  )
}

function ChannelChat({ socket, me, channel, serverId }){
  const [messages, setMessages] = useState([])
  const [text, setText] = useState('')
  const messagesEndRef = useRef(null)

  useEffect(()=>{
    if (!socket || !channel) return;
    const fn = (m) => {
      if (m.channelId === channel.id) fetchMessages();
    }
    socket.on('channel_message', fn)
    return () => socket.off('channel_message', fn)
  }, [socket, channel])

  async function fetchMessages(){
    const res = await fetch('/api/channels/' + channel.id + '/messages', { headers: { 'Authorization': 'Bearer ' + localStorage.token } })
    const j = await res.json();
    setMessages(j.messages || [])
  }

  useEffect(()=>{ if (channel) fetchMessages() }, [channel])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  function send(){
    if (!text) return;
    socket.emit('channel_message', { channelId: channel.id, content: text })
    setText('')
  }

  function handleKeyPress(e){
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  return (
    <div className="channelChat">
      <div className="chatHeader"># {channel.name}</div>
      <div className="messages">
        {messages.map(m => (
          <div key={m.id} className={m.user_id === me.id ? 'msg me' : 'msg them'}>
            <span className="username">{m.username}</span>: {m.content}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>
      <div className="composer">
        <input 
          value={text} 
          onChange={e=>setText(e.target.value)} 
          onKeyPress={handleKeyPress}
          placeholder={`Message #${channel.name}`} 
        />
        <button onClick={send}>Send</button>
      </div>
    </div>
  )
}

function VoiceChannel({ socket, me, channel, serverId }){
  const [inVoice, setInVoice] = useState(false)
  const [voiceUsers, setVoiceUsers] = useState([])
  const [muted, setMuted] = useState(false)
  const [deafened, setDeafened] = useState(false)
  const [sharingScreen, setSharingScreen] = useState(false)
  const localStreamRef = useRef(null)
  const screenStreamRef = useRef(null)
  const peerConnectionsRef = useRef({})
  const localAudioRef = useRef(null)
  const remoteAudiosRef = useRef({})

  useEffect(() => {
    if (!socket) return;

    socket.on('voice-user-joined', (data) => {
      console.log('User joined voice:', data)
      setVoiceUsers(prev => [...prev, data])
      // Initiate connection to new user
      if (inVoice) createPeerConnection(data.userId)
    })

    socket.on('voice-user-left', (data) => {
      console.log('User left voice:', data)
      setVoiceUsers(prev => prev.filter(u => u.userId !== data.userId))
      if (peerConnectionsRef.current[data.userId]) {
        peerConnectionsRef.current[data.userId].close()
        delete peerConnectionsRef.current[data.userId]
      }
    })

    socket.on('voice-offer', async (data) => {
      console.log('Received voice offer from:', data.from)
      await handleVoiceOffer(data)
    })

    socket.on('voice-answer', async (data) => {
      console.log('Received voice answer from:', data.from)
      const pc = peerConnectionsRef.current[data.from]
      if (pc) await pc.setRemoteDescription(data.answer)
    })

    socket.on('voice-candidate', async (data) => {
      const pc = peerConnectionsRef.current[data.from]
      if (pc) await pc.addIceCandidate(data.candidate)
    })

    socket.on('screen-share-started', (data) => {
      console.log('User started screen share:', data)
    })

    socket.on('screen-share-stopped', (data) => {
      console.log('User stopped screen share:', data)
    })

    return () => {
      socket.off('voice-user-joined')
      socket.off('voice-user-left')
      socket.off('voice-offer')
      socket.off('voice-answer')
      socket.off('voice-candidate')
      socket.off('screen-share-started')
      socket.off('screen-share-stopped')
    }
  }, [socket, inVoice])

  async function createPeerConnection(targetUserId) {
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    })
    
    peerConnectionsRef.current[targetUserId] = pc

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => {
        pc.addTrack(track, localStreamRef.current)
      })
    }

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        socket.emit('voice-candidate', { targetUserId, candidate: e.candidate })
      }
    }

    pc.ontrack = (e) => {
      console.log('Received remote track from:', targetUserId)
      if (!remoteAudiosRef.current[targetUserId]) {
        const audio = new Audio()
        audio.srcObject = e.streams[0]
        audio.play()
        remoteAudiosRef.current[targetUserId] = audio
      }
    }

    const offer = await pc.createOffer()
    await pc.setLocalDescription(offer)
    socket.emit('voice-offer', { channelId: channel.id, targetUserId, offer })
  }

  async function handleVoiceOffer(data) {
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    })
    
    peerConnectionsRef.current[data.from] = pc

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => {
        pc.addTrack(track, localStreamRef.current)
      })
    }

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        socket.emit('voice-candidate', { targetUserId: data.from, candidate: e.candidate })
      }
    }

    pc.ontrack = (e) => {
      console.log('Received remote track from:', data.from)
      if (!remoteAudiosRef.current[data.from]) {
        const audio = new Audio()
        audio.srcObject = e.streams[0]
        audio.play()
        remoteAudiosRef.current[data.from] = audio
      }
    }

    await pc.setRemoteDescription(data.offer)
    const answer = await pc.createAnswer()
    await pc.setLocalDescription(answer)
    socket.emit('voice-answer', { targetUserId: data.from, answer })
  }

  async function joinVoice() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      localStreamRef.current = stream
      if (localAudioRef.current) localAudioRef.current.srcObject = stream
      
      socket.emit('voice-join', { channelId: channel.id })
      setInVoice(true)
      console.log('Joined voice channel')
    } catch (err) {
      console.error('Failed to get media:', err)
      alert('Could not access microphone')
    }
  }

  function leaveVoice() {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop())
      localStreamRef.current = null
    }
    
    Object.values(peerConnectionsRef.current).forEach(pc => pc.close())
    peerConnectionsRef.current = {}
    
    Object.values(remoteAudiosRef.current).forEach(audio => audio.pause())
    remoteAudiosRef.current = {}
    
    socket.emit('voice-leave', { channelId: channel.id })
    setInVoice(false)
    setVoiceUsers([])
    console.log('Left voice channel')
  }

  function toggleMute() {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0]
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled
        setMuted(!audioTrack.enabled)
      }
    }
  }

  function toggleDeafen() {
    const newDeafened = !deafened
    setDeafened(newDeafened)
    Object.values(remoteAudiosRef.current).forEach(audio => {
      audio.volume = newDeafened ? 0 : 1
    })
  }

  async function toggleScreenShare() {
    if (!sharingScreen) {
      try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true })
        screenStreamRef.current = screenStream
        
        // Add screen track to all peer connections
        const screenTrack = screenStream.getVideoTracks()[0]
        Object.values(peerConnectionsRef.current).forEach(pc => {
          const sender = pc.getSenders().find(s => s.track?.kind === 'video')
          if (sender) {
            sender.replaceTrack(screenTrack)
          } else {
            pc.addTrack(screenTrack, screenStream)
          }
        })
        
        socket.emit('screen-share-start', { channelId: channel.id })
        setSharingScreen(true)
        
        screenTrack.onended = () => {
          stopScreenShare()
        }
      } catch (err) {
        console.error('Failed to share screen:', err)
      }
    } else {
      stopScreenShare()
    }
  }

  function stopScreenShare() {
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach(track => track.stop())
      screenStreamRef.current = null
    }
    socket.emit('screen-share-stop', { channelId: channel.id })
    setSharingScreen(false)
  }

  return (
    <div className="voiceChannel">
      <div className="voiceHeader">
        <h3>🔊 {channel.name}</h3>
      </div>
      
      <div className="voiceContent">
        {!inVoice ? (
          <div className="voiceJoin">
            <p>Click to join voice channel</p>
            <button onClick={joinVoice} className="joinVoiceBtn">Join Voice</button>
          </div>
        ) : (
          <div className="voiceActive">
            <h4>In Voice Channel</h4>
            <div className="voiceUsers">
              <div className="voiceUser">
                <span>{me.username} (You)</span>
                {muted && <span className="status">🔇</span>}
                {deafened && <span className="status">🔇🎧</span>}
              </div>
              {voiceUsers.map(u => (
                <div key={u.userId} className="voiceUser">
                  <span>{u.username}</span>
                </div>
              ))}
            </div>
            
            <div className="voiceControls">
              <button onClick={toggleMute} className={muted ? 'active' : ''}>
                {muted ? '🔇 Unmute' : '🎤 Mute'}
              </button>
              <button onClick={toggleDeafen} className={deafened ? 'active' : ''}>
                {deafened ? '🔊 Undeafen' : '🔇 Deafen'}
              </button>
              <button onClick={toggleScreenShare} className={sharingScreen ? 'active' : ''}>
                {sharingScreen ? '🛑 Stop Share' : '🖥️ Share Screen'}
              </button>
              <button onClick={leaveVoice} className="danger">
                Disconnect
              </button>
            </div>
          </div>
        )}
      </div>
      
      <audio ref={localAudioRef} muted autoPlay style={{ display: 'none' }} />
    </div>
  )
}

function FriendsPanel({ socket, me, onClose, onSelectFriend }) {
  const [friends, setFriends] = useState([])
  const [incoming, setIncoming] = useState([])
  const [users, setUsers] = useState([])
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    loadFriends()
    loadUsers()
  }, [])

  useEffect(() => {
    if (!socket) return
    socket.on('friend_request', () => {
      loadFriends()
    })
    return () => socket.off('friend_request')
  }, [socket])

  async function loadFriends() {
    const res = await fetch('/api/friends', { headers: { 'Authorization': 'Bearer ' + localStorage.token } })
    const j = await res.json()
    setFriends(j.friends || [])
    setIncoming(j.incoming || [])
  }

  async function loadUsers(q = '') {
    const url = '/api/users' + (q ? ('?search=' + encodeURIComponent(q)) : '')
    const res = await fetch(url, { headers: { 'Authorization': 'Bearer ' + localStorage.token } })
    const j = await res.json()
    setUsers(j.users || [])
  }

  async function addFriend(username) {
    const res = await fetch('/api/friends/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + localStorage.token },
      body: JSON.stringify({ username })
    })
    const j = await res.json()
    if (j.error) return alert('Error: ' + j.error)
    alert('Friend request sent!')
    loadFriends()
  }

  async function acceptFriend(requesterId) {
    await fetch('/api/friends/accept', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + localStorage.token },
      body: JSON.stringify({ requesterId })
    })
    loadFriends()
  }

  function handleSearch() {
    loadUsers(searchQuery)
  }

  return (
    <div className="friendsPanel">
      <div className="friendsHeader">
        <h3>Friends</h3>
        <button onClick={onClose}>✕</button>
      </div>

      <div className="friendsSection">
        <h4>Your Friends</h4>
        <ul>
          {friends.map(f => (
            <li key={f.id} onClick={() => { onSelectFriend(f); onClose(); }}>
              {f.username}
            </li>
          ))}
        </ul>
      </div>

      <div className="friendsSection">
        <h4>Incoming Requests</h4>
        <ul>
          {incoming.map(r => (
            <li key={r.request_id}>
              {r.requester_username}
              <button onClick={() => acceptFriend(r.requester_id)}>Accept</button>
            </li>
          ))}
        </ul>
      </div>

      <div className="friendsSection">
        <h4>Add Friends</h4>
        <div className="searchBox">
          <input
            placeholder="Search users..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
          <button onClick={handleSearch}>Search</button>
        </div>
        <ul>
          {users.map(u => (
            <li key={u.id}>
              {u.username}
              <button onClick={() => addFriend(u.username)}>Add</button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

function DirectMessage({ socket, me, friend }) {
  const [messages, setMessages] = useState([])
  const [text, setText] = useState('')
  const messagesEndRef = useRef(null)

  useEffect(() => {
    if (!socket || !friend) return
    const fn = (m) => {
      if ((m.from === friend.id) || (m.to === friend.id)) fetchMessages()
    }
    socket.on('private_message', fn)
    return () => socket.off('private_message', fn)
  }, [socket, friend])

  async function fetchMessages() {
    const res = await fetch('/api/messages/' + friend.id, { headers: { 'Authorization': 'Bearer ' + localStorage.token } })
    const j = await res.json()
    setMessages(j.messages || [])
  }

  useEffect(() => { if (friend) fetchMessages() }, [friend])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  function send() {
    if (!text) return
    socket.emit('private_message', { to: friend.id, content: text })
    setText('')
  }

  function handleKeyPress(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  const [inCall, setInCall] = useState(false)
  const [incomingCall, setIncomingCall] = useState(null)
  const pcRef = useRef(null)
  const localStreamRef = useRef(null)
  const remoteAudioRef = useRef(null)

  useEffect(() => {
    if (!socket) return

    socket.on('webrtc-offer', async (data) => {
      if (data.from === friend.id) {
        setIncomingCall(data)
      }
    })

    socket.on('webrtc-answer', async (data) => {
      if (data.from === friend.id && pcRef.current) {
        await pcRef.current.setRemoteDescription(data.answer)
      }
    })

    socket.on('webrtc-candidate', async (data) => {
      if (data.from === friend.id && pcRef.current) {
        await pcRef.current.addIceCandidate(data.candidate)
      }
    })

    socket.on('webrtc-hangup', (data) => {
      if (data.from === friend.id) {
        endCall()
        alert('Call ended')
      }
    })

    socket.on('webrtc-reject', (data) => {
      if (data.from === friend.id) {
        endCall()
        alert('Call rejected')
      }
    })

    return () => {
      socket.off('webrtc-offer')
      socket.off('webrtc-answer')
      socket.off('webrtc-candidate')
      socket.off('webrtc-hangup')
      socket.off('webrtc-reject')
    }
  }, [socket, friend])

  async function startCall() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      localStreamRef.current = stream

      const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] })
      pcRef.current = pc

      stream.getTracks().forEach(track => pc.addTrack(track, stream))

      pc.onicecandidate = (e) => {
        if (e.candidate) {
          socket.emit('webrtc-candidate', { to: friend.id, candidate: e.candidate })
        }
      }

      pc.ontrack = (e) => {
        if (remoteAudioRef.current) {
          remoteAudioRef.current.srcObject = e.streams[0]
          remoteAudioRef.current.play()
        }
      }

      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)
      socket.emit('webrtc-offer', { to: friend.id, offer })
      setInCall(true)
    } catch (err) {
      console.error('Failed to start call:', err)
      alert('Could not access microphone')
    }
  }

  async function acceptCall() {
    if (!incomingCall) return

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      localStreamRef.current = stream

      const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] })
      pcRef.current = pc

      stream.getTracks().forEach(track => pc.addTrack(track, stream))

      pc.onicecandidate = (e) => {
        if (e.candidate) {
          socket.emit('webrtc-candidate', { to: friend.id, candidate: e.candidate })
        }
      }

      pc.ontrack = (e) => {
        if (remoteAudioRef.current) {
          remoteAudioRef.current.srcObject = e.streams[0]
          remoteAudioRef.current.play()
        }
      }

      await pc.setRemoteDescription(incomingCall.offer)
      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)
      socket.emit('webrtc-answer', { to: friend.id, answer })
      
      setInCall(true)
      setIncomingCall(null)
    } catch (err) {
      console.error('Failed to accept call:', err)
      alert('Could not access microphone')
    }
  }

  function rejectCall() {
    socket.emit('webrtc-reject', { to: friend.id })
    setIncomingCall(null)
  }

  function endCall() {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop())
      localStreamRef.current = null
    }
    if (pcRef.current) {
      pcRef.current.close()
      pcRef.current = null
    }
    if (inCall) {
      socket.emit('webrtc-hangup', { to: friend.id })
    }
    setInCall(false)
  }

  return (
    <div className="directMessage">
      <div className="chatHeader">
        @ {friend.username}
        {!inCall ? (
          <button onClick={startCall} style={{ marginLeft: 'auto', padding: '6px 12px', background: '#3ba55d', color: 'white', border: 'none', borderRadius: '3px', cursor: 'pointer' }}>
            📞 Call
          </button>
        ) : (
          <button onClick={endCall} style={{ marginLeft: 'auto', padding: '6px 12px', background: '#ed4245', color: 'white', border: 'none', borderRadius: '3px', cursor: 'pointer' }}>
            📞 Hang Up
          </button>
        )}
      </div>

      {incomingCall && (
        <div style={{ padding: '16px', background: '#5865f2', color: 'white', textAlign: 'center' }}>
          <p>Incoming call from {friend.username}</p>
          <button onClick={acceptCall} style={{ margin: '8px', padding: '8px 16px', background: '#3ba55d', color: 'white', border: 'none', borderRadius: '3px', cursor: 'pointer' }}>
            Accept
          </button>
          <button onClick={rejectCall} style={{ margin: '8px', padding: '8px 16px', background: '#ed4245', color: 'white', border: 'none', borderRadius: '3px', cursor: 'pointer' }}>
            Reject
          </button>
        </div>
      )}

      {inCall && (
        <div style={{ padding: '8px', background: '#3ba55d', color: 'white', textAlign: 'center' }}>
          In call with {friend.username}
        </div>
      )}

      <div className="messages">
        {messages.map(m => (
          <div key={m.id} className={m.from_id === me.id ? 'msg me' : 'msg them'}>
            <span className="username">{m.from_id === me.id ? 'You' : friend.username}</span>: {m.content}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>
      <div className="composer">
        <input
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder={`Message @${friend.username}`}
        />
        <button onClick={send}>Send</button>
      </div>
      
      <audio ref={remoteAudioRef} autoPlay style={{ display: 'none' }} />
    </div>
  )
}

export default function App(){
  const API = import.meta.env.VITE_API_BASE || ''
  const [token, setToken] = useState(localStorage.token || null)
  const [me, setMe] = useState(null)
  const [socket, setSocket] = useState(null)
  const [servers, setServers] = useState([])
  const [selectedServer, setSelectedServer] = useState(null)
  const [channels, setChannels] = useState([])
  const [selectedChannel, setSelectedChannel] = useState(null)
  const [showFriends, setShowFriends] = useState(false)
  const [selectedFriend, setSelectedFriend] = useState(null)

  useEffect(()=>{
    if (!token) return;
    localStorage.token = token
    fetch('/api/me', { headers: { 'Authorization': 'Bearer ' + token } }).then(r=>r.json()).then(j=>{ setMe(j.user) })
    const s = (API && API !== '') ? io(API, { auth: { token } }) : io({ auth: { token } })
    setSocket(s)
    s.on('connect_error', e=>console.error('sock err', e))
    return () => s.close()
  }, [token])

  useEffect(()=>{ if (!token) return; loadServers(); }, [token])

  async function onAuth(t, user){ setToken(t); setMe(user) }

  async function loadServers(){
    const res = await fetch((API || '') + '/api/servers', { headers: { 'Authorization': 'Bearer ' + token } })
    const j = await res.json(); 
    setServers(j.servers || [])
    if (j.servers && j.servers.length > 0 && !selectedServer) {
      selectServer(j.servers[0])
    }
  }

  async function createServer(name){
    const res = await fetch((API || '') + '/api/servers', { 
      method:'POST', 
      headers:{'Content-Type':'application/json', 'Authorization':'Bearer ' + token}, 
      body: JSON.stringify({ name }) 
    })
    const j = await res.json();
    if (j.error) return alert('Error: ' + j.error)
    loadServers()
  }

  async function selectServer(server){
    setSelectedServer(server)
    setSelectedChannel(null)
    setSelectedFriend(null)
    const res = await fetch((API || '') + '/api/servers/' + server.id + '/channels', { 
      headers: { 'Authorization': 'Bearer ' + token } 
    })
    const j = await res.json();
    setChannels(j.channels || [])
    if (j.channels && j.channels.length > 0) {
      setSelectedChannel(j.channels[0])
    }
  }

  async function createChannel(name, type){
    if (!selectedServer) return;
    const res = await fetch((API || '') + '/api/servers/' + selectedServer.id + '/channels', { 
      method:'POST', 
      headers:{'Content-Type':'application/json', 'Authorization':'Bearer ' + token}, 
      body: JSON.stringify({ name, type }) 
    })
    const j = await res.json();
    if (j.error) return alert('Error: ' + j.error)
    selectServer(selectedServer)
  }

  async function createInvite() {
    if (!selectedServer) return
    const res = await fetch('/api/servers/' + selectedServer.id + '/invites', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token }
    })
    const j = await res.json()
    if (j.error) return alert('Error: ' + j.error)
    
    const inviteLink = window.location.origin + '?invite=' + j.inviteCode
    prompt('Share this invite link:', inviteLink)
  }

  async function joinByInviteCode(code) {
    const res = await fetch('/api/invites/' + code + '/join', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token }
    })
    const j = await res.json()
    if (j.error) return alert('Error: ' + j.error)
    alert('Joined server: ' + j.server.name)
    loadServers()
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const inviteCode = params.get('invite')
    if (inviteCode && token) {
      joinByInviteCode(inviteCode)
      window.history.replaceState({}, '', '/')
    }
  }, [token])

  if (!token) return <Auth onAuth={onAuth} />

  return (
    <div className="discordApp">
      <div className="leftSidebar">
        <ServerList 
          servers={servers} 
          selectedServerId={selectedServer?.id} 
          onSelect={selectServer} 
          onCreate={createServer} 
        />
      </div>
      <div className="middleSidebar">
        {selectedServer && (
          <ChannelList 
            channels={channels} 
            selectedChannelId={selectedChannel?.id} 
            onSelect={(ch) => { setSelectedChannel(ch); setSelectedFriend(null); }} 
            onCreate={createChannel}
            isOwner={selectedServer.owner_id === me?.id}
            onInvite={createInvite}
            onJoinByCode={joinByInviteCode}
            onShowFriends={() => setShowFriends(true)}
          />
        )}
      </div>
      <div className="mainContent">
        {showFriends ? (
          <FriendsPanel 
            socket={socket} 
            me={me} 
            onClose={() => setShowFriends(false)}
            onSelectFriend={(f) => { setSelectedFriend(f); setSelectedChannel(null); }}
          />
        ) : selectedFriend ? (
          <DirectMessage socket={socket} me={me} friend={selectedFriend} />
        ) : selectedChannel && selectedServer ? (
          selectedChannel.type === 'voice' ? (
            <VoiceChannel 
              socket={socket} 
              me={me} 
              channel={selectedChannel}
              serverId={selectedServer.id}
            />
          ) : (
            <ChannelChat 
              socket={socket} 
              me={me} 
              channel={selectedChannel}
              serverId={selectedServer.id}
            />
          )
        ) : (
          <div className="placeholder">
            <h2>Welcome to Discord Clone!</h2>
            <p>Select a server and channel to start chatting</p>
          </div>
        )}
      </div>
      <div className="userPanel">
        <div className="userInfo">
          <span className="username">{me?.username}</span>
        </div>
      </div>
    </div>
  )
}
