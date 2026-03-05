// OrderDetails.jsx
import React, { useState, useEffect, useMemo } from 'react'
import {
  Search,
  Filter,
  Eye,
  Download,
  Package,
  Truck,
  CheckCircle,
  Clock,
  RefreshCw,
  Edit,
  Save,
  X,
  History,
  User,
  Mail,
  Phone,
  AlertCircle
} from 'lucide-react'
import {
  collection,
  collectionGroup,
  getDocs,
  getDoc,
  updateDoc,
  doc,
  query,
  where,
  arrayUnion
} from 'firebase/firestore'
import { onAuthStateChanged } from 'firebase/auth'
import { db, auth } from '../config/firebase'

// Utility: format Firestore timestamp safely
const formatOrderDate = (timestamp) => {
  if (!timestamp) return 'N/A'
  try {
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp)
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    })
  } catch (e) {
    return 'Invalid Date'
  }
}

// IMPROVED: Better customer info extraction with more field possibilities
const extractCustomerInfo = (orderData) => {
  const data = orderData || {}
  
 
  
  // Method 1: Check for nested customer object
  if (data.customer && typeof data.customer === 'object') {
    console.log('Found customer object:', data.customer)
    return {
      name: data.customer.name || data.customer.displayName || data.customer.fullName || 
             data.customer.userName || data.customer.customerName || 'Anonymous',
      email: data.customer.email || data.customer.emailAddress || 
             data.customer.userEmail || data.customer.customerEmail || '',
      phone: data.customer.phone || data.customer.phoneNumber || data.customer.mobile || 
             data.customer.telephone || data.customer.userPhone || data.customer.customerPhone || ''
    }
  }
  
  // Method 2: Check for buyer object
  if (data.buyer && typeof data.buyer === 'object') {
    console.log('Found buyer object:', data.buyer)
    return {
      name: data.buyer.name || data.buyer.displayName || 'Anonymous',
      email: data.buyer.email || data.buyer.emailAddress || '',
      phone: data.buyer.phone || data.buyer.phoneNumber || data.buyer.mobile || ''
    }
  }
  
  // Method 3: Check for user object
  if (data.user && typeof data.user === 'object') {
    console.log('Found user object:', data.user)
    return {
      name: data.user.name || data.user.displayName || 'Anonymous',
      email: data.user.email || data.user.emailAddress || '',
      phone: data.user.phone || data.user.phoneNumber || data.user.mobile || ''
    }
  }
  
  // Method 4: Check root level fields with more variations
  console.log('Checking root level fields')
  return {
    name: data.userName || data.buyerName || data.customerName || data.name || 
           data.displayName || data.fullName || data.purchaserName || 'Anonymous',
    email: data.userEmail || data.buyerEmail || data.customerEmail || data.email || 
           data.emailAddress || data.purchaserEmail || '',
    phone: data.userPhone || data.buyerPhone || data.customerPhone || data.phone || 
           data.phoneNumber || data.mobile || data.telephone || data.purchaserPhone || ''
  }
}

// Helper function to extract products from various field names
const extractProducts = (orderData) => {
  const data = orderData || {}
  
  // Try different possible product field names
  if (data.products && Array.isArray(data.products)) {
    return data.products
  }
  
  if (data.items && Array.isArray(data.items)) {
    return data.items
  }
  
  if (data.product && typeof data.product === 'object') {
    return [data.product]
  }
  
  if (data.item && typeof data.item === 'object') {
    return [data.item]
  }
  
  // Check for cart items
  if (data.cart && Array.isArray(data.cart)) {
    return data.cart
  }
  
  return []
}

// Helper function to calculate total
const calculateTotal = (products) => {
  if (!products || !Array.isArray(products)) return 0
  return products.reduce((sum, product) => {
    const price = parseFloat(product.price) || parseFloat(product.amount) || parseFloat(product.cost) || 0
    const quantity = parseInt(product.quantity) || parseInt(product.qty) || 1
    return sum + (price * quantity)
  }, 0)
}

// Helper function to extract status
const extractStatus = (orderData) => {
  const data = orderData || {}
  const status = data.status || data.orderStatus || data.state || 'pending'
  
  // Normalize status
  const statusMap = {
    'pending': 'pending',
    'processing': 'processing',
    'shipped': 'shipped',
    'delivered': 'delivered',
    'completed': 'delivered',
    'cancelled': 'cancelled',
    'failed': 'cancelled',
    'refunded': 'cancelled'
  }
  
  return statusMap[status.toLowerCase()] || 'pending'
}

const OrderDetails = ({ sellerId = null, orderPath = null }) => {
  const [searchTerm, setSearchTerm] = useState('')
  const [filterStatus, setFilterStatus] = useState('all')
  const [selectedOrder, setSelectedOrder] = useState(null)
  const [orders, setOrders] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [suggestions, setSuggestions] = useState([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(-1)
  const [isUpdating, setIsUpdating] = useState(false)
  const [sellerUid, setSellerUid] = useState(null)
  const [editingCustomer, setEditingCustomer] = useState(false)
  const [editingProduct, setEditingProduct] = useState(null)
  const [showActivity, setShowActivity] = useState(false)

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setSellerUid(user ? user.uid : null)
    })
    return () => unsub()
  }, [])

  const statusCounts = useMemo(() => {
    return orders.reduce((acc, order) => {
      acc.total += 1
      if (order.status === 'pending') acc.pending += 1
      if (order.status === 'processing') acc.processing += 1
      if (order.status === 'delivered') acc.delivered += 1
      return acc
    }, { total: 0, pending: 0, processing: 0, delivered: 0 })
  }, [orders])

  const fetchOrders = async () => {
    setIsLoading(true)
    setMessage('')
    
    const effectiveSellerId = sellerId || sellerUid

    try {
      // 1. Single Order Path Fetch
      if (orderPath && typeof orderPath === 'string' && orderPath.split('/').length >= 4) {
        const segments = orderPath.replace(/^\/+|\/+$/g, '').split('/')
        if (segments.length >= 4) {
          const [col1, userId, col2, orderId] = segments
          if ((col1 === 'users' || col1 === 'user') && col2 === 'orders') {
            const orderRef = doc(db, col1, userId, col2, orderId)
            const snap = await getDoc(orderRef)
            if (snap.exists()) {
              const orderData = snap.data()
              const processedOrder = processOrderData(orderData, snap.id, snap.ref.path)
              setOrders([processedOrder])
            } else {
              setMessage('Order not found at provided path.')
            }
            setIsLoading(false)
            return
          }
        }
      }

      if (!effectiveSellerId) {
        setMessage('No seller signed in.')
        setIsLoading(false)
        return
      }

      // 2. Multi-query fetch with Deduplication using a Map
      const ordersMap = new Map()

      const addToMap = (docs) => {
        docs.forEach(d => {
          const orderData = d.data()
          const processedOrder = processOrderData(orderData, d.id, d.ref.path)
          ordersMap.set(d.id, processedOrder)
        })
      }

      // Query variant 1: sellerid
      try {
        const q1 = query(collectionGroup(db, 'orders'), where('sellerid', '==', effectiveSellerId))
        const snap1 = await getDocs(q1)
        addToMap(snap1.docs)
      } catch (err) { console.warn('Query1 failed', err) }

      // Query variant 2: sellerID
      try {
        const q2 = query(collectionGroup(db, 'orders'), where('sellerID', '==', effectiveSellerId))
        const snap2 = await getDocs(q2)
        addToMap(snap2.docs)
      } catch (err) { console.warn('Query2 failed', err) }

      // Query variant 3: seller
      try {
        const q3 = query(collectionGroup(db, 'orders'), where('seller', '==', effectiveSellerId))
        const snap3 = await getDocs(q3)
        addToMap(snap3.docs)
      } catch (err) { console.warn('Query3 failed', err) }

      // Query variant 4: userId
      try {
        const q4 = query(collectionGroup(db, 'orders'), where('userId', '==', effectiveSellerId))
        const snap4 = await getDocs(q4)
        addToMap(snap4.docs)
      } catch (err) { console.warn('Query4 failed', err) }

      // Query variant 5: owner
      try {
        const q5 = query(collectionGroup(db, 'orders'), where('owner', '==', effectiveSellerId))
        const snap5 = await getDocs(q5)
        addToMap(snap5.docs)
      } catch (err) { console.warn('Query5 failed', err) }

      // 3. Fallback Scan (only if nothing found yet)
      if (ordersMap.size === 0) {
        try {
          const allSnap = await getDocs(collectionGroup(db, 'orders'))
          allSnap.docs.forEach(d => {
            const data = d.data()
            const candidates = [
              data.sellerid, 
              data.sellerID, 
              data.seller, 
              data.owner, 
              data.userId,
              data.buyerId,
              data.customerId
            ]
            if (candidates.some(c => c && String(c) === String(effectiveSellerId))) {
              const processedOrder = processOrderData(data, d.id, d.ref.path)
              ordersMap.set(d.id, processedOrder)
            }
          })
        } catch (err) { console.error('Fallback fetch failed', err) }
      }

      let merged = Array.from(ordersMap.values())

      // 4. Client-side Sort
      merged.sort((a, b) => {
        const ta = a.createdAt?.toDate?.() || a.timestamp?.toDate?.() || new Date(a.createdAt || a.timestamp || 0)
        const tb = b.createdAt?.toDate?.() || b.timestamp?.toDate?.() || new Date(b.createdAt || b.timestamp || 0)
        return tb - ta
      })

      console.log('Processed orders:', merged)
      setOrders(merged)
      
      if (merged.length === 0) {
        setMessage('No orders found. Please check your seller ID or create some test orders.')
      }
    } catch (err) {
      console.error('Error fetching orders:', err)
      setMessage('Error loading orders. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  // Process raw order data into standardized format
  const processOrderData = (orderData, id, path) => {
    console.log('Processing order data - FULL DATA:', orderData)
    
    const customer = extractCustomerInfo(orderData)
    const products = extractProducts(orderData)
    const status = extractStatus(orderData)
    const total = orderData.total || orderData.amount || orderData.price || calculateTotal(products)
    
    
    return {
      id: id,
      __path: path,
      // Original data
      ...orderData,
      // Standardized fields
      customer,
      products,
      status,
      total: parseFloat(total) || 0,
      // Ensure date fields
      createdAt: orderData.createdAt || orderData.timestamp || orderData.orderDate || new Date(),
      activityLog: orderData.activityLog || []
    }
  }

  const addActivityLog = async (orderId, action, details, orderObj = null) => {
    try {
      const activityEntry = {
        action,
        details,
        timestamp: new Date(),
        performedBy: sellerUid || 'admin'
      }

      let orderRef;
      if (orderObj && orderObj.__path) {
        const parts = orderObj.__path.split('/')
        if (parts.length >= 4) {
          const [col1, userId, col2, orderIdFromPath] = parts
          orderRef = doc(db, col1, userId, col2, orderIdFromPath)
        } else {
          orderRef = doc(db, 'orders', orderId)
        }
      } else {
        orderRef = doc(db, 'orders', orderId)
      }

      await updateDoc(orderRef, {
        activityLog: arrayUnion(activityEntry)
      })

      // Update local state
      setOrders(prev => prev.map(o => {
        if (o.id === orderId) {
          return {
            ...o,
            activityLog: [...(o.activityLog || []), activityEntry]
          }
        }
        return o
      }))

      if (selectedOrder && selectedOrder.id === orderId) {
        setSelectedOrder(prev => ({
          ...prev,
          activityLog: [...(prev.activityLog || []), activityEntry]
        }))
      }
    } catch (err) {
      console.error('Error adding activity log:', err)
    }
  }

  const updateOrderStatus = async (orderId, newStatus, orderObj = null) => {
    setIsUpdating(true)
    try {
      let orderRef;
      if (orderObj && orderObj.__path) {
        const parts = orderObj.__path.split('/')
        if (parts.length >= 4) {
          const [col1, userId, col2, orderIdFromPath] = parts
          orderRef = doc(db, col1, userId, col2, orderIdFromPath)
        } else {
          orderRef = doc(db, 'orders', orderId)
        }
      } else {
        orderRef = doc(db, 'orders', orderId)
      }

      // Update both status and orderStatus fields for compatibility
      await updateDoc(orderRef, { 
        status: newStatus,
        orderStatus: newStatus,
        updatedAt: new Date() 
      })

      // Add activity log
      await addActivityLog(
        orderId, 
        'STATUS_UPDATE', 
        `Order status changed to ${newStatus}`,
        orderObj
      )

      setOrders(prev => prev.map(o => o.id === orderId ? ({ ...o, status: newStatus }) : o))
      if (selectedOrder && selectedOrder.id === orderId) setSelectedOrder(prev => ({ ...prev, status: newStatus }))
      setMessage('Order status updated successfully!')
    } catch (err) {
      console.error('Error updating order status:', err)
      setMessage('Error updating order status. Please try again.')
    } finally {
      setIsUpdating(false)
    }
  }

  const updateCustomerDetails = async (orderId, updatedCustomer, orderObj = null) => {
    setIsUpdating(true)
    try {
      let orderRef;
      if (orderObj && orderObj.__path) {
        const parts = orderObj.__path.split('/')
        if (parts.length >= 4) {
          const [col1, userId, col2, orderIdFromPath] = parts
          orderRef = doc(db, col1, userId, col2, orderIdFromPath)
        } else {
          orderRef = doc(db, 'orders', orderId)
        }
      } else {
        orderRef = doc(db, 'orders', orderId)
      }

      // Update customer object
      await updateDoc(orderRef, { 
        customer: updatedCustomer,
        updatedAt: new Date()
      })

      // Add activity log
      await addActivityLog(
        orderId,
        'CUSTOMER_UPDATE',
        `Customer details updated: ${updatedCustomer.name} (${updatedCustomer.email})`,
        orderObj
      )

      setOrders(prev => prev.map(o => 
        o.id === orderId ? { ...o, customer: updatedCustomer } : o
      ))
      if (selectedOrder && selectedOrder.id === orderId) {
        setSelectedOrder(prev => ({ ...prev, customer: updatedCustomer }))
      }
      setMessage('Customer details updated successfully!')
    } catch (err) {
      console.error('Error updating customer details:', err)
      setMessage('Error updating customer details. Please try again.')
    } finally {
      setIsUpdating(false)
      setEditingCustomer(false)
    }
  }

  const updateProductPrice = async (orderId, productIndex, newPrice, orderObj = null) => {
    setIsUpdating(true)
    try {
      let orderRef;
      if (orderObj && orderObj.__path) {
        const parts = orderObj.__path.split('/')
        if (parts.length >= 4) {
          const [col1, userId, col2, orderIdFromPath] = parts
          orderRef = doc(db, col1, userId, col2, orderIdFromPath)
        } else {
          orderRef = doc(db, 'orders', orderId)
        }
      } else {
        orderRef = doc(db, 'orders', orderId)
      }

      const orderDoc = await getDoc(orderRef)
      if (!orderDoc.exists()) {
        throw new Error('Order not found')
      }

      const orderData = orderDoc.data()
      const products = extractProducts(orderData)
      const oldPrice = products[productIndex]?.price || 0
      
      // Update the product price
      products[productIndex] = {
        ...products[productIndex],
        price: parseFloat(newPrice)
      }

      // Recalculate total
      const newTotal = calculateTotal(products)

      await updateDoc(orderRef, {
        products: products,
        total: newTotal,
        updatedAt: new Date()
      })

      // Add activity log
      await addActivityLog(
        orderId,
        'PRICE_UPDATE',
        `Product price updated from ₹${oldPrice} to ₹${newPrice}`,
        orderObj
      )

      setOrders(prev => prev.map(o => 
        o.id === orderId ? { 
          ...o, 
          products: products,
          total: newTotal
        } : o
      ))
      if (selectedOrder && selectedOrder.id === orderId) {
        setSelectedOrder(prev => ({ 
          ...prev, 
          products: products,
          total: newTotal
        }))
      }
      setMessage('Product price updated successfully!')
    } catch (err) {
      console.error('Error updating product price:', err)
      setMessage('Error updating product price. Please try again.')
    } finally {
      setIsUpdating(false)
      setEditingProduct(null)
    }
  }

  useEffect(() => {
    fetchOrders()
  }, [sellerId, orderPath, sellerUid])

  const generateSuggestions = (searchValue) => {
    if (!searchValue.trim()) {
      setSuggestions([])
      return
    }
    const searchLower = searchValue.toLowerCase().trim()
    const suggestionSet = new Set()
    orders.forEach(order => {
      if (order.id?.toLowerCase().includes(searchLower)) suggestionSet.add(order.id)
      if (order.customer?.name?.toLowerCase().includes(searchLower)) suggestionSet.add(order.customer.name)
      if (order.customer?.email?.toLowerCase().includes(searchLower)) suggestionSet.add(order.customer.email)
      order.products?.forEach(product => {
        if (product.name?.toLowerCase().includes(searchLower)) suggestionSet.add(product.name)
      })
      if (order.shippingAddress?.toLowerCase().includes(searchLower)) suggestionSet.add(order.shippingAddress)
    })
    setSuggestions(Array.from(suggestionSet).slice(0, 8))
  }

  const handleSearchChange = (e) => {
    const value = e.target.value
    setSearchTerm(value)
    generateSuggestions(value)
    setShowSuggestions(true)
    setSelectedSuggestionIndex(-1)
  }

  const handleSuggestionClick = (suggestion) => {
    setSearchTerm(suggestion)
    setShowSuggestions(false)
    setSelectedSuggestionIndex(-1)
  }

  const handleKeyDown = (e) => {
    if (!showSuggestions || suggestions.length === 0) return
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setSelectedSuggestionIndex(prev => prev < suggestions.length - 1 ? prev + 1 : 0)
        break
      case 'ArrowUp':
        e.preventDefault()
        setSelectedSuggestionIndex(prev => prev > 0 ? prev - 1 : suggestions.length - 1)
        break
      case 'Enter':
        e.preventDefault()
        if (selectedSuggestionIndex >= 0) {
          handleSuggestionClick(suggestions[selectedSuggestionIndex])
        } else {
          setShowSuggestions(false)
        }
        break
      case 'Escape':
        setShowSuggestions(false)
        setSelectedSuggestionIndex(-1)
        break
      default:
        break
    }
  }

  const filteredOrders = orders.filter(order => {
    const searchLower = searchTerm.toLowerCase().trim()
    const matchesSearch =
      (order.id?.toLowerCase().includes(searchLower)) ||
      (order.customer?.name?.toLowerCase().includes(searchLower)) ||
      (order.customer?.email?.toLowerCase().includes(searchLower)) ||
      (order.customer?.phone?.toLowerCase().includes(searchLower)) ||
      (order.products?.some(product =>
        product.name?.toLowerCase().includes(searchLower) ||
        product.sku?.toLowerCase().includes(searchLower)
      )) ||
      (order.shippingAddress?.toLowerCase().includes(searchLower)) ||
      (order.paymentMethod?.toLowerCase().includes(searchLower))

    const matchesFilter = filterStatus === 'all' || order.status === filterStatus
    return matchesSearch && matchesFilter
  })

  const getStatusColor = (status) => {
    switch (status) {
      case 'delivered': return 'bg-green-600/20 text-green-400 border border-green-700'
      case 'shipped': return 'bg-blue-600/20 text-blue-400 border border-blue-700'
      case 'processing': return 'bg-yellow-600/20 text-yellow-400 border border-yellow-700'
      case 'pending': return 'bg-gray-600/20 text-gray-400 border border-gray-700'
      case 'cancelled': return 'bg-red-600/20 text-red-400 border border-red-700'
      default: return 'bg-gray-600/20 text-gray-400 border border-gray-700'
    }
  }

  const getStatusIcon = (status) => {
    switch (status) {
      case 'delivered': return <CheckCircle className="w-4 h-4 text-green-400" />
      case 'shipped': return <Truck className="w-4 h-4 text-blue-400" />
      case 'processing': return <Package className="w-4 h-4 text-yellow-400" />
      case 'pending': return <Clock className="w-4 h-4 text-gray-400" />
      default: return <Clock className="w-4 h-4 text-gray-400" />
    }
  }

  const OrderModal = ({ order, onClose }) => {
    const [statusToUpdate, setStatusToUpdate] = useState(order.status)
    const [customerEdit, setCustomerEdit] = useState({
      name: order.customer?.name || '',
      email: order.customer?.email || '',
      phone: order.customer?.phone || ''
    })

    const handleUpdateStatus = () => {
      if (statusToUpdate !== order.status) {
        updateOrderStatus(order.id, statusToUpdate, order)
      }
    }

    const handleSaveCustomer = () => {
      updateCustomerDetails(order.id, customerEdit, order)
    }

    const handleProductPriceUpdate = (index, newPrice) => {
      updateProductPrice(order.id, index, parseFloat(newPrice), order)
    }

    return (
      <div className="fixed inset-0 bg-black bg-opacity-75 backdrop-blur-sm flex items-center justify-center z-50">
        <div className="bg-gray-800 rounded-xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto border border-gray-700 shadow-2xl">
          <div className="p-6 border-b border-gray-700 sticky top-0 bg-gray-800 z-10">
            <div className="flex justify-between items-center">
              <div className="flex items-center space-x-4">
                <h2 className="text-2xl font-bold text-white">Order: #{order.id}</h2>
                <button 
                  onClick={() => setShowActivity(true)}
                  className="flex items-center text-gray-400 hover:text-blue-400 bg-gray-700/50 hover:bg-gray-700 px-3 py-1 rounded-lg text-sm"
                >
                  <History className="w-4 h-4 mr-2" />
                  View Activity
                </button>
              </div>
              <button onClick={onClose} className="text-gray-400 hover:text-red-500 p-1 rounded-full hover:bg-gray-700">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
              </button>
            </div>
            <div className="flex items-center space-x-2 mt-2">
              {getStatusIcon(order.status)}
              <span className={`px-3 py-1 rounded-full text-sm font-semibold ${getStatusColor(order.status)}`}>
                {order.status?.charAt(0).toUpperCase() + order.status?.slice(1)}
              </span>
            </div>
          </div>

          <div className="p-6 space-y-6">
            {/* Customer Details Section */}
            <div className="bg-gray-700/50 p-4 rounded-xl border border-gray-700">
              <div className="flex justify-between items-center mb-3">
                <h3 className="font-semibold text-lg text-blue-400">Customer Details</h3>
                {!editingCustomer ? (
                  <button 
                    onClick={() => setEditingCustomer(true)}
                    className="flex items-center text-gray-400 hover:text-yellow-400 text-sm"
                  >
                    <Edit className="w-4 h-4 mr-1" /> Edit
                  </button>
                ) : (
                  <div className="flex space-x-2">
                    <button 
                      onClick={handleSaveCustomer}
                      disabled={isUpdating}
                      className="flex items-center bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded-lg text-sm"
                    >
                      <Save className="w-4 h-4 mr-1" /> {isUpdating ? 'Saving...' : 'Save'}
                    </button>
                    <button 
                      onClick={() => {
                        setEditingCustomer(false)
                        setCustomerEdit({
                          name: order.customer?.name || '',
                          email: order.customer?.email || '',
                          phone: order.customer?.phone || ''
                        })
                      }}
                      className="flex items-center bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded-lg text-sm"
                    >
                      <X className="w-4 h-4 mr-1" /> Cancel
                    </button>
                  </div>
                )}
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                {editingCustomer ? (
                  <>
                    <div className="space-y-2">
                      <label className="block text-white">Name</label>
                      <div className="relative">
                        <User className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input 
                          type="text" 
                          value={customerEdit.name}
                          onChange={(e) => setCustomerEdit({...customerEdit, name: e.target.value})}
                          className="pl-10 pr-3 py-2 bg-gray-800 border border-gray-600 text-white rounded-lg w-full"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="block text-white">Phone</label>
                      <div className="relative">
                        <Phone className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input 
                          type="tel" 
                          value={customerEdit.phone}
                          onChange={(e) => setCustomerEdit({...customerEdit, phone: e.target.value})}
                          className="pl-10 pr-3 py-2 bg-gray-800 border border-gray-600 text-white rounded-lg w-full"
                        />
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="text-gray-300"><strong className="text-white block">Name:</strong> {order.customer?.name || 'Anonymous'}</p>
                    <p className="text-gray-300"><strong className="text-white block">Phone:</strong> {order.customer?.phone || 'No phone'}</p>
                    <p className="text-gray-300"><strong className="text-white block">Payment:</strong> {order.paymentMethod || 'N/A'}</p>
                  </>
                )}
              </div>
            </div>

            {/* Products Section with Price Editing */}
            <div className="bg-gray-700/50 p-4 rounded-xl border border-gray-700">
              <h3 className="font-semibold mb-3 text-lg text-blue-400">Products ({order.products?.length || 0})</h3>
              {order.products && order.products.length > 0 ? (
                <>
                  <div className="space-y-3">
                    {order.products?.map((product, index) => (
                      <div key={index} className="flex justify-between items-center bg-gray-800 p-4 rounded-lg border border-gray-700">
                        <div className="flex-grow">
                          <p className="font-medium text-white">{product.name || product.title || `Product ${index + 1}`}</p>
                          <p className="text-xs text-gray-400">SKU: {product.sku || 'N/A'}</p>
                          <p className="text-sm text-gray-300 mt-1">Qty: {product.quantity || product.qty || 1}</p>
                        </div>
                        
                        <div className="text-right">
                          {editingProduct === index ? (
                            <div className="flex items-center space-x-2">
                              <div className="relative">
                                <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400">₹</span>
                                <input 
                                  type="number"
                                  step="0.01"
                                  defaultValue={product.price || 0}
                                  onBlur={(e) => {
                                    const newPrice = parseFloat(e.target.value)
                                    if (!isNaN(newPrice) && newPrice !== product.price) {
                                      handleProductPriceUpdate(index, newPrice)
                                    }
                                    setEditingProduct(null)
                                  }}
                                  onKeyPress={(e) => {
                                    if (e.key === 'Enter') {
                                      const newPrice = parseFloat(e.target.value)
                                      if (!isNaN(newPrice) && newPrice !== product.price) {
                                        handleProductPriceUpdate(index, newPrice)
                                      }
                                      setEditingProduct(null)
                                    }
                                  }}
                                  className="pl-8 pr-3 py-1 bg-gray-700 border border-gray-600 text-white rounded-lg w-32 text-right"
                                  autoFocus
                                />
                              </div>
                              <button 
                                onClick={() => setEditingProduct(null)}
                                className="text-gray-400 hover:text-red-500"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                          ) : (
                            <div className="space-y-1">
                              <div className="flex items-center justify-end space-x-2">
                                <p className="font-semibold text-green-400 text-lg">
                                  ₹{((product.price || 0) * (product.quantity || product.qty || 1)).toLocaleString()}
                                </p>
                                <button 
                                  onClick={() => setEditingProduct(index)}
                                  className="text-gray-400 hover:text-yellow-400"
                                  title="Edit price"
                                >
                                  <Edit className="w-4 h-4" />
                                </button>
                              </div>
                              <p className="text-sm text-gray-400">
                                ₹{(product.price || 0).toLocaleString()} × {product.quantity || product.qty || 1}
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="p-4 mt-4 bg-gray-700 rounded-lg">
                    <div className="flex justify-between items-center font-bold text-lg">
                      <span className="text-white">Total Amount:</span>
                      <span className="text-green-300">₹{order.total?.toLocaleString() || '0'}</span>
                    </div>
                  </div>
                </>
              ) : (
                <div className="text-center py-4 text-gray-400">
                  <Package className="w-8 h-8 mx-auto mb-2" />
                  <p>No products found in this order</p>
                </div>
              )}
            </div>

            {/* Shipping & Tracking */}
            <div className="bg-gray-700/50 p-4 rounded-xl border border-gray-700">
              <h3 className="font-semibold mb-3 text-lg text-blue-400">Shipping & Tracking</h3>
              <div className="text-sm space-y-2">
                <p className="text-gray-300"><strong className="text-white">Address:</strong> {order.shippingAddress || order.address || 'N/A'}</p>
                <p className="text-gray-300"><strong className="text-white">Order Date:</strong> {formatOrderDate(order.createdAt || order.orderDate || order.timestamp)}</p>
                {order.deliveryDate && <p className="text-gray-300"><strong className="text-white">Delivery Date:</strong> {formatOrderDate(order.deliveryDate)}</p>}
                {order.trackingNumber && <p className="text-gray-300"><strong className="text-white">Tracking Number:</strong> <span className="font-mono text-yellow-400">{order.trackingNumber}</span></p>}
              </div>
            </div>

            {/* Update Status */}
            <div className="bg-gray-700/50 p-4 rounded-xl border border-gray-700">
              <h3 className="font-semibold mb-3 text-lg text-blue-400">Update Status</h3>
              <div className="flex items-center space-x-3">
                <select 
                  value={statusToUpdate} 
                  onChange={(e) => setStatusToUpdate(e.target.value)} 
                  className="bg-gray-700 border border-gray-600 text-white rounded-lg px-3 py-2 flex-grow"
                >
                  <option value="pending">Pending</option>
                  <option value="processing">Processing</option>
                  <option value="shipped">Shipped</option>
                  <option value="delivered">Delivered</option>
                  <option value="cancelled">Cancelled</option>
                </select>
                <button 
                  onClick={handleUpdateStatus} 
                  disabled={statusToUpdate === order.status || isUpdating} 
                  className={`px-4 py-2 rounded-lg text-white font-medium flex items-center ${statusToUpdate === order.status || isUpdating ? 'bg-gray-600 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'}`}
                >
                  {isUpdating ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Package className="w-4 h-4 mr-2" />}
                  {isUpdating ? 'Updating...' : 'Update Status'}
                </button>
              </div>
            </div>
          </div>

          <div className="p-6 border-t border-gray-700 flex justify-between">
            <div className="flex space-x-2">
              <button 
                onClick={() => setShowActivity(true)}
                className="flex items-center text-gray-400 hover:text-blue-400 bg-gray-700/50 hover:bg-gray-700 px-4 py-2 rounded-lg"
              >
                <History className="w-4 h-4 mr-2" />
                View Activity Log
              </button>
              <button 
                onClick={() => {
                  console.log('Customer object:', order.customer)
                  console.log('Original order data:', orders.find(o => o.id === order.id))
                  alert('Order data logged to console. Check developer tools (F12) -> Console tab.')
                }}
                className="flex items-center text-gray-400 hover:text-yellow-400 bg-gray-700/50 hover:bg-gray-700 px-4 py-2 rounded-lg text-sm"
              >
                <AlertCircle className="w-4 h-4 mr-2" />
                Debug Data
              </button>
            </div>
            <button onClick={onClose} className="px-4 py-2 border border-gray-600 rounded-lg text-gray-300 hover:bg-gray-700">Close</button>
          </div>
        </div>
      </div>
    )
  }

  const ActivityModal = ({ order, onClose }) => {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-75 backdrop-blur-sm flex items-center justify-center z-50">
        <div className="bg-gray-800 rounded-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto border border-gray-700 shadow-2xl">
          <div className="p-6 border-b border-gray-700 sticky top-0 bg-gray-800 z-10">
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-bold text-white">Activity Log</h2>
              <button onClick={onClose} className="text-gray-400 hover:text-red-500 p-1 rounded-full hover:bg-gray-700">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
              </button>
            </div>
            <p className="text-gray-400 text-sm mt-1">Order: #{order.id}</p>
          </div>

          <div className="p-6">
            {order.activityLog && order.activityLog.length > 0 ? (
              <div className="space-y-4">
                {[...order.activityLog]
                  .sort((a, b) => b.timestamp?.seconds - a.timestamp?.seconds || 0)
                  .map((activity, index) => (
                    <div key={index} className="bg-gray-700/50 p-4 rounded-lg border border-gray-700">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-medium text-white">{activity.action.replace('_', ' ')}</p>
                          <p className="text-sm text-gray-300 mt-1">{activity.details}</p>
                        </div>
                        <span className="text-xs text-gray-400">
                          {activity.timestamp?.toDate ? 
                            formatOrderDate(activity.timestamp) : 
                            new Date(activity.timestamp).toLocaleString()}
                        </span>
                      </div>
                      {activity.performedBy && (
                        <p className="text-xs text-gray-400 mt-2">Performed by: {activity.performedBy}</p>
                      )}
                    </div>
                  ))}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                <History className="w-12 h-12 mx-auto mb-4 text-gray-600" />
                <p>No activity recorded for this order yet.</p>
              </div>
            )}
          </div>

          <div className="p-6 border-t border-gray-700 flex justify-end">
            <button onClick={onClose} className="px-4 py-2 border border-gray-600 rounded-lg text-gray-300 hover:bg-gray-700">Close</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 bg-gray-900 min-h-screen font-sans">
      <div className="mb-8 border-b border-gray-800 pb-4">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-4xl font-extrabold text-white mb-2 tracking-tight">Order Management Dashboard 📦</h1>
            <p className="text-gray-400 text-lg">Track, search, and manage customer orders with real-time updates.</p>
          </div>
      
        </div>
      </div>

      {message && (
        <div className={`mb-6 p-4 rounded-xl ${message.includes('Error') ? 'bg-red-900/50 text-red-300 border border-red-700' : 'bg-green-900/50 text-green-300 border border-green-700'}`}>
          {message}
        </div>
      )}

      {isLoading ? (
        <div className="flex flex-col justify-center items-center py-20 text-blue-400">
          <RefreshCw className="w-8 h-8 animate-spin-slow mb-4" />
          <div className="text-xl">Loading orders... Please wait.</div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <div className="bg-gray-800 p-5 rounded-xl border border-gray-700 shadow-xl">
              <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider">Total Orders</h3>
              <p className="text-3xl font-bold text-white mt-1">{statusCounts.total}</p>
            </div>
            <div className="bg-gray-800 p-5 rounded-xl border border-gray-700 shadow-xl">
              <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider">Pending</h3>
              <p className="text-3xl font-bold text-yellow-400 mt-1">{statusCounts.pending}</p>
            </div>
            <div className="bg-gray-800 p-5 rounded-xl border border-gray-700 shadow-xl">
              <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider">Processing</h3>
              <p className="text-3xl font-bold text-blue-400 mt-1">{statusCounts.processing}</p>
            </div>
            <div className="bg-gray-800 p-5 rounded-xl border border-gray-700 shadow-xl">
              <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider">Delivered</h3>
              <p className="text-3xl font-bold text-green-400 mt-1">{statusCounts.delivered}</p>
            </div>
          </div>

          <div className="bg-gray-800 rounded-xl border border-gray-700 shadow-2xl mb-8">
            <div className="p-5 border-b border-gray-700">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div className="flex flex-wrap items-center gap-4">
                  <div className="relative search-container">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-blue-400 w-4 h-4 z-10" />
                    <input type="text" placeholder="Search orders..." value={searchTerm} onChange={handleSearchChange} onKeyDown={handleKeyDown} onFocus={() => setShowSuggestions(true)} className="pl-10 pr-4 py-2 bg-gray-700/70 border border-gray-600 text-white rounded-lg w-full md:w-80" />
                    {showSuggestions && suggestions.length > 0 && (
                      <div className="absolute top-full left-0 right-0 mt-2 bg-gray-700 border border-gray-600 rounded-lg shadow-xl z-20 max-h-60 overflow-y-auto">
                        {suggestions.map((s, i) => (
                          <div key={i} className={`px-3 py-2 cursor-pointer text-sm text-gray-300 ${i === selectedSuggestionIndex ? 'bg-blue-600/50 text-white' : 'hover:bg-gray-600'}`} onClick={() => handleSuggestionClick(s)} onMouseEnter={() => setSelectedSuggestionIndex(i)}>{s}</div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center space-x-2">
                    <Filter className="w-4 h-4 text-gray-400" />
                    <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="bg-gray-700/70 border border-gray-600 text-white rounded-lg px-3 py-2">
                      <option value="all">All Status</option>
                      <option value="pending">Pending</option>
                      <option value="processing">Processing</option>
                      <option value="shipped">Shipped</option>
                      <option value="delivered">Delivered</option>
                      <option value="cancelled">Cancelled</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-gray-700 border-b border-gray-600">
                  <tr>
                    <th className="px-6 py-3 text-xs font-semibold text-gray-300 uppercase tracking-wider">Order ID</th>
                    <th className="px-6 py-3 text-xs font-semibold text-gray-300 uppercase tracking-wider">Customer</th>
                    <th className="px-6 py-3 text-xs font-semibold text-gray-300 uppercase tracking-wider">Phone</th>
                    <th className="px-6 py-3 text-xs font-semibold text-gray-300 uppercase tracking-wider">Products</th>
                    <th className="px-6 py-3 text-xs font-semibold text-gray-300 uppercase tracking-wider">Total</th>
                    <th className="px-6 py-3 text-xs font-semibold text-gray-300 uppercase tracking-wider">Date</th>
                    <th className="px-6 py-3 text-xs font-semibold text-gray-300 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 text-xs font-semibold text-gray-300 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700">
                  {filteredOrders.length > 0 ? filteredOrders.map((order) => (
                    <tr key={order.id} className="bg-gray-800 hover:bg-gray-700/70 transition-colors duration-200">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-white/90">{order.id}</td>
                      
                      {/* CUSTOMER NAME COLUMN */}
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <User className="w-4 h-4 mr-2 text-blue-400" />
                          <span className="text-sm font-bold text-white">
                            {order.customer?.name || 'Anonymous'}
                          </span>
                        </div>
                      </td>


                      {/* PHONE COLUMN */}
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <Phone className="w-4 h-4 mr-2 text-green-400" />
                          <span className="text-sm text-gray-300">
                            {order.customer?.phone || 'No phone'}
                          </span>
                        </div>
                      </td>

                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                        <div className="flex items-center">
                          <Package className="w-4 h-4 mr-2 text-purple-400" />
                          {order.products?.length || 0} item(s)
                        </div>
                      </td>
                      
                      {/* TOTAL COLUMN */}
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-bold text-green-400 bg-green-400/10 px-3 py-1.5 rounded-md border border-green-400/20 inline-flex items-center">
                          <span className="mr-1">₹</span>
                          {order.total?.toLocaleString() || '0'}
                        </div>
                      </td>

                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400">
                        {formatOrderDate(order.createdAt || order.orderDate || order.timestamp)}
                      </td>
                      
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center space-x-2">
                          {getStatusIcon(order.status)}
                          <span className={`inline-flex px-3 py-1 text-xs font-semibold rounded-full ${getStatusColor(order.status)}`}>
                            {order.status?.charAt(0).toUpperCase() + order.status?.slice(1)}
                          </span>
                        </div>
                      </td>

                      {/* ACTIONS COLUMN */}
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <button 
                          onClick={() => setSelectedOrder(order)} 
                          className="group flex items-center bg-blue-600/10 hover:bg-blue-600 text-blue-400 hover:text-white px-3 py-1.5 rounded-lg border border-blue-600/30 transition-all duration-200"
                        >
                          <Eye className="w-4 h-4 mr-2 group-hover:scale-110 transition-transform" /> 
                          View Details
                        </button>
                      </td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan="9" className="p-8 text-center text-gray-500 text-lg">
                        <div className="flex flex-col items-center">
                          <Package className="w-12 h-12 text-gray-600 mb-4" />
                          <p>No orders found matching your criteria.</p>
                          {orders.length === 0 && (
                            <p className="text-sm text-gray-400 mt-2">
                              Please check if you're signed in and have orders in your database.
                            </p>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {selectedOrder && <OrderModal order={selectedOrder} onClose={() => setSelectedOrder(null)} />}
          {selectedOrder && showActivity && (
            <ActivityModal 
              order={selectedOrder} 
              onClose={() => setShowActivity(false)} 
            />
          )}
        </>
      )}
    </div>
  )
}

export default OrderDetails