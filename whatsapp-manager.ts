/**
 * WhatsApp Multi-User Service
 * 
 * Railway'de calisacak HTTP API servisi.
 * Her kullanici kendi WhatsApp hesabini baglar,
 * QR kodlar Firestore uzerinden frontend'e iletilir.
 * 
 * Endpoints:
 * - POST /api/connect/:userId - WhatsApp baglantisi baslat
 * - POST /api/disconnect/:userId - Baglantıyı kes
 * - POST /api/logout/:userId - Oturumu kapat ve temizle
 * - GET /api/status/:userId - Baglanti durumunu kontrol et
 * - GET /api/health - Servis saglik kontrolu
 */

import express from 'express'
import cors from 'cors'
import { WhatsAppManager } from './whatsapp-manager.js'
import { subscribeToConnectionRequests } from './firebase.js'

const app = express()
const PORT = process.env.PORT || 3001

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  methods: ['GET', 'POST'],
  credentials: true
}))
app.use(express.json())

// WhatsApp Manager instance
const waManager = new WhatsAppManager()

// API Key dogrulama middleware (opsiyonel guvenlik)
const authenticateRequest = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const apiKey = req.headers['x-api-key']
  const expectedKey = process.env.API_SECRET_KEY

  if (expectedKey && apiKey !== expectedKey) {
    return res.status(401).json({ error: 'Yetkisiz erisim' })
  }
  next()
}

// Routes

// Saglik kontrolu
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    activeSessions: waManager.getActiveSessions().length
  })
})

// WhatsApp baglantisi baslat
app.post('/api/connect/:userId', authenticateRequest, async (req, res) => {
  const { userId } = req.params

  if (!userId) {
    return res.status(400).json({ error: 'userId gerekli' })
  }

  try {
    const result = await waManager.startSession(userId)
    res.json(result)
  } catch (error) {
    console.error(`[API] Connect hatasi (${userId}):`, error)
    res.status(500).json({ 
      success: false, 
      message: error instanceof Error ? error.message : 'Bilinmeyen hata' 
    })
  }
})

// Baglantıyı kes (session'i durdur)
app.post('/api/disconnect/:userId', authenticateRequest, async (req, res) => {
  const { userId } = req.params

  if (!userId) {
    return res.status(400).json({ error: 'userId gerekli' })
  }

  try {
    const result = await waManager.stopSession(userId)
    res.json(result)
  } catch (error) {
    console.error(`[API] Disconnect hatasi (${userId}):`, error)
    res.status(500).json({ 
      success: false, 
      message: error instanceof Error ? error.message : 'Bilinmeyen hata' 
    })
  }
})

// Oturumu tamamen kapat ve temizle
app.post('/api/logout/:userId', authenticateRequest, async (req, res) => {
  const { userId } = req.params

  if (!userId) {
    return res.status(400).json({ error: 'userId gerekli' })
  }

  try {
    const result = await waManager.logoutSession(userId)
    res.json(result)
  } catch (error) {
    console.error(`[API] Logout hatasi (${userId}):`, error)
    res.status(500).json({ 
      success: false, 
      message: error instanceof Error ? error.message : 'Bilinmeyen hata' 
    })
  }
})

// Session durumunu kontrol et
app.get('/api/status/:userId', authenticateRequest, async (req, res) => {
  const { userId } = req.params

  if (!userId) {
    return res.status(400).json({ error: 'userId gerekli' })
  }

  const status = waManager.getSessionStatus(userId)
  res.json(status)
})

// Tum aktif session'lari listele (admin icin)
app.get('/api/sessions', authenticateRequest, (req, res) => {
  const sessions = waManager.getActiveSessions()
  res.json({
    count: sessions.length,
    sessions
  })
})

// Firestore'dan gelen baglanti taleplerini dinle
subscribeToConnectionRequests(async (ownerId, action) => {
  console.log(`[Firestore] Baglanti talebi: ${ownerId} -> ${action}`)
  
  if (action === 'connect') {
    await waManager.startSession(ownerId)
  } else if (action === 'disconnect') {
    await waManager.stopSession(ownerId)
  }
})

// Sunucuyu baslat
app.listen(PORT, () => {
  console.log('╔══════════════════════════════════════════════════════════════╗')
  console.log('║       WhatsApp Multi-User Service - Railway Edition          ║')
  console.log('╠══════════════════════════════════════════════════════════════╣')
  console.log(`║  Port: ${PORT}                                                   ║`)
  console.log('║  Status: Running                                             ║')
  console.log('╚══════════════════════════════════════════════════════════════╝')
  console.log('')
  console.log('Endpoints:')
  console.log(`  POST /api/connect/:userId    - WhatsApp baglantisi baslat`)
  console.log(`  POST /api/disconnect/:userId - Baglantiyi kes`)
  console.log(`  POST /api/logout/:userId     - Oturumu kapat`)
  console.log(`  GET  /api/status/:userId     - Durum kontrol`)
  console.log(`  GET  /api/health             - Servis sagligi`)
  console.log('')
})

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n[Server] Kapatiliyor...')
  await waManager.stopAllSessions()
  process.exit(0)
})

process.on('SIGTERM', async () => {
  console.log('\n[Server] Sonlandiriliyor...')
  await waManager.stopAllSessions()
  process.exit(0)
})
