import admin from 'firebase-admin'
import { getFirestore, Timestamp, FieldValue } from 'firebase-admin/firestore'

// Firebase Admin SDK yapilandirmasi
const initializeFirebase = () => {
  if (admin.apps.length > 0) {
    return admin.app()
  }

  // Service account environment variable'larindan
  const serviceAccount = {
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  }

  if (!serviceAccount.projectId || !serviceAccount.clientEmail || !serviceAccount.privateKey) {
    throw new Error(
      'Firebase yapilandirmasi eksik. FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL ve FIREBASE_PRIVATE_KEY environment variable\'larini ayarlayin.'
    )
  }

  return admin.initializeApp({
    credential: admin.credential.cert(serviceAccount as admin.ServiceAccount),
  })
}

initializeFirebase()
export const db = getFirestore()

// ==================== WhatsApp Baglanti Yonetimi ====================

// Baglanti durumunu guncelle ve QR kodu kaydet
export async function updateConnectionStatus(
  ownerId: string,
  status: 'disconnected' | 'connecting' | 'qr_ready' | 'connected' | 'error',
  data?: { qrCode?: string; phoneNumber?: string; deviceName?: string; errorMessage?: string }
) {
  const connectionRef = db.collection('whatsapp_connections').doc(ownerId)
  
  const updateData: Record<string, unknown> = {
    status,
    updatedAt: FieldValue.serverTimestamp(),
  }

  if (data?.qrCode !== undefined) updateData.qrCode = data.qrCode
  if (data?.phoneNumber) updateData.phoneNumber = data.phoneNumber
  if (data?.deviceName) updateData.deviceName = data.deviceName
  if (data?.errorMessage) updateData.errorMessage = data.errorMessage

  if (status === 'connected') {
    updateData.lastConnectedAt = FieldValue.serverTimestamp()
    updateData.qrCode = null
    updateData.errorMessage = null
  }

  if (status === 'disconnected') {
    updateData.qrCode = null
  }

  await connectionRef.set(updateData, { merge: true })
  console.log(`[Firebase] Baglanti durumu guncellendi: ${ownerId} -> ${status}`)
}

// Kullanicinin baglanti talebini kontrol et
export async function getConnectionRequest(ownerId: string) {
  const connectionRef = db.collection('whatsapp_connections').doc(ownerId)
  const doc = await connectionRef.get()
  return doc.exists ? doc.data() : null
}

// Bekleyen baglanti taleplerini dinle
export function subscribeToConnectionRequests(
  callback: (ownerId: string, action: 'connect' | 'disconnect') => void
) {
  return db.collection('whatsapp_connections')
    .where('requestAction', 'in', ['connect', 'disconnect'])
    .onSnapshot((snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added' || change.type === 'modified') {
          const data = change.doc.data()
          if (data.requestAction) {
            callback(change.doc.id, data.requestAction)
            // Talep islendiginde temizle
            change.doc.ref.update({ requestAction: FieldValue.delete() })
          }
        }
      })
    })
}

// ==================== Mesaj Kaydetme ====================

interface MessageData {
  groupId: string
  groupName: string
  sender: {
    id: string
    name: string
    pushName?: string
  }
  content: {
    type: 'text' | 'image' | 'video' | 'document' | 'audio' | 'sticker'
    text?: string
    caption?: string
    mediaUrl?: string
    mimeType?: string
  }
  timestamp: Date
  ownerId: string
}

export async function saveMessage(messageId: string, data: MessageData) {
  const messageRef = db.collection('messages').doc(messageId)
  
  await messageRef.set({
    ...data,
    timestamp: Timestamp.fromDate(data.timestamp),
    createdAt: FieldValue.serverTimestamp(),
  })

  // Grup son mesaj zamanini guncelle
  const groupRef = db.collection('groups').doc(data.groupId)
  await groupRef.set(
    {
      lastMessageAt: FieldValue.serverTimestamp(),
      messageCount: FieldValue.increment(1),
    },
    { merge: true }
  )

  // Gunluk istatistik
  const today = new Date()
  const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  const hour = today.getHours().toString()
  const statsRef = db.collection('stats').doc(`${data.ownerId}_${dateStr}`)

  await statsRef.set(
    {
      id: `${data.ownerId}_${dateStr}`,
      date: Timestamp.fromDate(new Date(dateStr)),
      ownerId: data.ownerId,
      totalMessages: FieldValue.increment(1),
      [`messagesByGroup.${data.groupId}`]: FieldValue.increment(1),
      [`messagesByHour.${hour}`]: FieldValue.increment(1),
    },
    { merge: true }
  )
}

// Grup kaydet
export async function saveOrUpdateGroup(groupId: string, data: {
  name: string
  description?: string
  participantCount: number
  ownerId: string
}) {
  const groupRef = db.collection('groups').doc(groupId)
  const doc = await groupRef.get()

  if (!doc.exists) {
    await groupRef.set({
      id: groupId,
      ...data,
      isActive: true,
      messageCount: 0,
      createdAt: FieldValue.serverTimestamp(),
      lastMessageAt: FieldValue.serverTimestamp(),
    })
  } else {
    await groupRef.set(
      {
        name: data.name,
        description: data.description,
        participantCount: data.participantCount,
      },
      { merge: true }
    )
  }
}

export { Timestamp, FieldValue }
