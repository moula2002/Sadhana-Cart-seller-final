// SellerProducts.jsx
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  collection,
  getDocs,
  query,
  where,
  doc,
  getDoc,
  updateDoc,
  serverTimestamp
} from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, auth, storage } from '../config/firebase';
import './SellerProducts.css';
import {
  Search,
  Grid,
  Tag,
  Plus,
  AlertTriangle,
  RefreshCw,
  Edit,
  Eye,
  X,
  Upload,
  Save,
  Package,
  Ruler,
  Palette,
  Layers,
  Image as ImageIcon,
  Hash,
  Shield,
  Award,
  Info,
  Clock,
  Check,
  AlertCircle
} from 'lucide-react';

const SellerProducts = React.memo(() => {
  const [products, setProducts] = useState([]);
  const [sellerDoc, setSellerDoc] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState('all');
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [sellerUid, setSellerUid] = useState(null);
  const [isUpdatingDetails, setIsUpdatingDetails] = useState(false);
  const [updateError, setUpdateError] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);

  const navigate = useNavigate();

  const productIdFromPath = useMemo(() => {
    try {
      const match = window.location.pathname.match(/\/products\/([^/]+)/);
      return match ? match[1] : null;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, user => {
      setSellerUid(user ? user.uid : null);
    });
    return unsubscribe;
  }, []);

  const mergeUniqueById = (arr1 = [], arr2 = []) => {
    const map = new Map();
    arr1.concat(arr2).forEach(item => {
      if (!item) return;
      map.set(item.id, item);
    });
    return Array.from(map.values());
  };

  const buildOwnerIdSet = useCallback((sellerData, uid) => {
    const s = new Set();
    if (uid) s.add(uid);
    if (!sellerData) return s;
    if (sellerData.id) s.add(sellerData.id);
    if (sellerData.sellerid) s.add(sellerData.sellerid);
    if (sellerData.sellerID) s.add(sellerData.sellerID);
    if (sellerData.sellerId) s.add(sellerData.sellerId);
    return s;
  }, []);

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    setError(null);
    setProducts([]);

    let sellerData = null;
    try {
      if (sellerUid) {
        const sellerRef = doc(db, 'sellers', sellerUid);
        const sSnap = await getDoc(sellerRef);
        if (sSnap.exists()) {
          sellerData = { id: sSnap.id, ...sSnap.data() };
          setSellerDoc(sellerData);
        } else {
          setSellerDoc(null);
        }
      } else {
        setSellerDoc(null);
      }
    } catch (err) {
      console.warn('Failed fetching seller doc:', err);
      setSellerDoc(null);
    }

    const ownerIdSet = buildOwnerIdSet(sellerData, sellerUid);

    if (productIdFromPath) {
      try {
        const pRef = doc(db, 'products', productIdFromPath);
        const pSnap = await getDoc(pRef);
        if (pSnap.exists()) {
          const p = { id: pSnap.id, ...pSnap.data() };
          const ownerMatches = (
            (p.sellerid && ownerIdSet.has(p.sellerid)) ||
            (p.sellerID && ownerIdSet.has(p.sellerID)) ||
            (p.sellerId && ownerIdSet.has(p.sellerId)) ||
            ownerIdSet.has(p.seller) ||
            ownerIdSet.has(p.owner)
          );
          if (ownerMatches || ownerIdSet.size === 0) {
            setProducts([p]);
          } else {
            setProducts([]);
            setError('You are not authorized to view this product.');
          }
        } else {
          setProducts([]);
          setError('Product not found.');
        }
      } catch (err) {
        console.error('Error fetching single product:', err);
        setError('Failed to fetch product.');
      } finally {
        setLoading(false);
      }
      return;
    }

    try {
      if (!sellerUid && ownerIdSet.size === 0) {
        setProducts([]);
        setLoading(false);
        setError('No seller signed in.');
        return;
      }

      let resultsA = [];
      try {
        const qA = query(
          collection(db, 'products'),
          where('sellerid', '==', sellerUid || '')
        );
        const snapA = await getDocs(qA);
        resultsA = snapA.docs.map(d => ({ id: d.id, ...d.data() }));
      } catch (err) {
        console.warn('Query sellerid failed:', err);
      }

      let resultsB = [];
      try {
        const qB = query(
          collection(db, 'products'),
          where('sellerID', '==', sellerUid || '')
        );
        const snapB = await getDocs(qB);
        resultsB = snapB.docs.map(d => ({ id: d.id, ...d.data() }));
      } catch (err) {
        console.warn('Query sellerID failed:', err);
      }

      let resultsC = [];
      try {
        if (sellerData && sellerData.id && sellerData.id !== sellerUid) {
          const qC1 = query(
            collection(db, 'products'),
            where('sellerid', '==', sellerData.id)
          );
          const snapC1 = await getDocs(qC1);
          resultsC = resultsC.concat(snapC1.docs.map(d => ({ id: d.id, ...d.data() })));

          const qC2 = query(
            collection(db, 'products'),
            where('sellerID', '==', sellerData.id)
          );
          const snapC2 = await getDocs(qC2);
          resultsC = resultsC.concat(snapC2.docs.map(d => ({ id: d.id, ...d.data() })));
        }
      } catch (err) {
        console.warn('Query using sellerData.id failed:', err);
      }

      const mergedServer = mergeUniqueById(resultsA, resultsB);
      const mergedAllServer = mergeUniqueById(mergedServer, resultsC);

      if (mergedAllServer.length > 0) {
        const filtered = mergedAllServer.filter(p => {
          const candidates = [p.sellerid, p.sellerID, p.sellerId, p.seller, p.owner];
          return candidates.some(c => c && ownerIdSet.has(c));
        });
        filtered.sort((a, b) => {
          const A = (a.brand || '').toString().toLowerCase();
          const B = (b.brand || '').toString().toLowerCase();
          return A < B ? -1 : A > B ? 1 : 0;
        });
        setProducts(filtered);
        setLoading(false);
        return;
      }

      try {
        const allSnap = await getDocs(collection(db, 'products'));
        let data = allSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        data = data.filter(p => {
          const candidates = [p.sellerid, p.sellerID, p.sellerId, p.seller, p.owner];
          return candidates.some(c => c && ownerIdSet.has(c));
        });
        data.sort((a, b) => {
          const A = (a.brand || '').toString().toLowerCase();
          const B = (b.brand || '').toString().toLowerCase();
          return A < B ? -1 : A > B ? 1 : 0;
        });
        setProducts(data);
        setLoading(false);
        return;
      } catch (fallbackErr) {
        console.error('Fallback fetch failed:', fallbackErr);
        setError('Failed fetching products (fallback).');
        setLoading(false);
        return;
      }
    } catch (err) {
      console.error('Error fetching products:', err);
      setError('Failed to fetch products. Check console for details.');
      setLoading(false);
    }
  }, [sellerUid, productIdFromPath, buildOwnerIdSet]);

  useEffect(() => {
    fetchProducts();
  }, [sellerUid, productIdFromPath, fetchProducts]);

  const handleUpdateProductDetails = useCallback(async (productId, updatedFields) => {
    setIsUpdatingDetails(true);
    setUpdateError(null);
    
    try {
      const productRef = doc(db, 'products', productId);

      const payload = {
        name: updatedFields.name || '',
        brand: updatedFields.brand || '',
        category: updatedFields.category || '',
        subCategory: updatedFields.subCategory || updatedFields.subcategory || '',
        
        price: Number(updatedFields.price) || 0,
        offerPrice: Number(updatedFields.offerPrice ?? updatedFields.offerprice) || 0,
        
        stock: Number(updatedFields.stockQuantity ?? updatedFields.stock) || 0,
        stockQuantity: Number(updatedFields.stockQuantity ?? updatedFields.stock) || 0,
        
        basesku: updatedFields.basesku || updatedFields.sku || '',
        sku: updatedFields.basesku || updatedFields.sku || '',
        hsnCode: updatedFields.hsnCode ?? updatedFields.hsncode ?? '',
        
        description: updatedFields.description || '',
        color: updatedFields.color || '',
        material: updatedFields.material || '',
        pattern: updatedFields.pattern || '',
        occasion: updatedFields.occasion || '',
        
        'length(cm)': Number(updatedFields['length(cm)'] || updatedFields.length) || 0,
        'width(cm)': Number(updatedFields['width(cm)'] || updatedFields.width) || 0,
        'height(cm)': Number(updatedFields['height(cm)'] || updatedFields.height) || 0,
        'weight(g)': Number(updatedFields['weight(g)'] || updatedFields.weight) || 0,
        
        careinstructions: updatedFields.careinstructions || '',
        cashOnDelivery: updatedFields.cashOnDelivery || 'No',
        gender: updatedFields.gender || '',
        seourl: updatedFields.seourl || '',
        
        images: Array.isArray(updatedFields.images) ? updatedFields.images : 
                (updatedFields.image ? [updatedFields.image] : []),
        specifications: Array.isArray(updatedFields.specifications) ? updatedFields.specifications : [],
        tags: Array.isArray(updatedFields.tags) ? updatedFields.tags : [],
        sizevariants: Array.isArray(updatedFields.sizevariants) ? updatedFields.sizevariants : [],
        colorVariants: Array.isArray(updatedFields.colorVariants) ? updatedFields.colorVariants : [],
        
        updatedAt: serverTimestamp(),
      };

      Object.keys(payload).forEach(key => {
        if (payload[key] === undefined || payload[key] === null) {
          delete payload[key];
        }
      });

      await updateDoc(productRef, payload);

      try {
        const sellerProductRef = doc(db, 'seller_products', productId);
        await updateDoc(sellerProductRef, payload);
      } catch (err) {
        console.warn('Could not update seller_products:', err);
      }

      setSelectedProduct(prev => {
        const updated = { ...prev, ...payload };
        if (updated.updatedAt) {
          updated.updatedAt = new Date().toISOString();
        }
        return updated;
      });

      setProducts(prevProducts => 
        prevProducts.map(p => 
          p.id === productId 
            ? { ...p, ...payload, updatedAt: new Date().toISOString() } 
            : p
        )
      );

      alert('✅ Product details updated successfully!');
      
    } catch (err) {
      console.error('Failed to update product details:', err);
      setUpdateError('Failed to update product details. ' + err.message);
      throw new Error('Update failed');
    } finally {
      setIsUpdatingDetails(false);
    }
  }, []);

  const handleImageUpload = useCallback(async (files, productId) => {
    if (!files.length || !productId) return;

    setIsUploading(true);
    setUploadProgress(0);
    const uploadedUrls = [];

    try {
      const sellerId = selectedProduct?.sellerid || 'anonymous';
      
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (file.size > 10 * 1024 * 1024) {
          setUpdateError(`❌ Image "${file.name}" exceeds 10MB limit`);
          continue;
        }

        const timestamp = Date.now();
        const storageRef = ref(storage, `product_images/${sellerId}/${timestamp}_${file.name}`);
        const snapshot = await uploadBytes(storageRef, file);
        const url = await getDownloadURL(snapshot.ref);
        uploadedUrls.push(url);
        setUploadProgress(Math.floor(((i + 1) / files.length) * 100));
      }

      if (uploadedUrls.length > 0) {
        setSelectedProduct(prev => ({
          ...prev,
          images: [...(prev.images || []), ...uploadedUrls]
        }));
        
        setUpdateError(null);
      }
    } catch (error) {
      console.error('Image upload failed:', error);
      setUpdateError('❌ Image upload failed. Please try again.');
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  }, [selectedProduct]);

  const filteredProducts = useMemo(() => {
    const searchLower = searchTerm.toLowerCase();
    return products.filter(product => {
      const brandMatch = product.brand ? product.brand.toLowerCase().includes(searchLower) : false;
      const descriptionMatch = product.description ? product.description.toLowerCase().includes(searchLower) : false;
      const skuMatch = product.basesku || product.sku ? (product.basesku || product.sku).toLowerCase().includes(searchLower) : false;
      const productNameMatch = product.name ? product.name.toLowerCase().includes(searchLower) : false;
      const searchKeywordsMatch = product.searchKeywords ? (product.searchKeywords.join(' ').toLowerCase()).includes(searchLower) : false;

      const matchesSearch = brandMatch || descriptionMatch || skuMatch || productNameMatch || searchKeywordsMatch;
      const matchesCategory = filterCategory === 'all' || product.category === filterCategory;
      return matchesSearch && matchesCategory;
    });
  }, [products, searchTerm, filterCategory]);

  const categories = useMemo(() => (['all', ...new Set(products.map(p => p.category).filter(Boolean))]), [products]);

  const handleViewDetails = useCallback((product) => {
    setSelectedProduct(product);
    setUpdateError(null);
  }, []);

  const handleCloseDetails = useCallback(() => {
    setSelectedProduct(null);
    setUpdateError(null);
    setIsUpdatingDetails(false);
    setUploadProgress(0);
    setIsUploading(false);
  }, []);

  const handleTouchStart = useCallback((e) => { e.currentTarget.style.transform = 'scale(0.98)'; }, []);
  const handleTouchEnd = useCallback((e) => { e.currentTarget.style.transform = 'scale(1)'; }, []);

  if (loading) {
    return (
      <div className="seller-products dark-theme">
        <div className="dashboard-header animated-header">
          <div className="header-content">
            <div className="title-section"><h1>Product Inventory 📦</h1><p>Manage your product catalog</p></div>
            <div className="stats-section"><div className="stat-item skeleton-stat"></div><div className="stat-item skeleton-stat"></div></div>
          </div>
          <div className="filters-section skeleton-filters">
            <div className="search-box-skeleton"></div>
            <div className="category-filter-skeleton"></div>
            <div className="add-product-btn-skeleton"></div>
          </div>
        </div>

        <div className="products-grid loading-grid">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="product-card skeleton">
              <div className="product-icon-skeleton"></div>
              <div className="card-content-skeleton">
                <div className="skeleton-text title"></div>
                <div className="skeleton-text short"></div>
                <div className="skeleton-text medium"></div>
                <div className="skeleton-buttons"></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="seller-products dark-theme">
      <div className="dashboard-header animated-header">
        <div className="header-content">
          <div className="title-section">
            <h1>Product Inventory 📦</h1>
            <p>Manage your product catalog efficiently</p>
          </div>

          <div className="stats-section">
            <div className="stat-item">
              <span className="stat-number">{products.length}</span>
              <span className="stat-label">Total Products</span>
            </div>
            <div className="stat-item">
              <span className="stat-number">{filteredProducts.length}</span>
              <span className="stat-label">Displayed</span>
            </div>
          </div>
        </div>

        <div className="filters-section">
          <div className="search-box">
            <Search className="search-icon" size={18} />
            <input
              type="text"
              placeholder="Search by brand, product name, SKU, or description..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="search-input"
            />
          </div>

          <div className="filter-group">
            <Tag size={18} className="filter-icon" />
            <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)} className="category-filter">
              {categories.map(c => <option key={c} value={c}>{c === 'all' ? 'All Categories' : c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
            </select>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button className="add-product-btn" onClick={() => navigate('/add-products')}>
              <Plus size={18} /> Add Product
            </button>
            <button className="refresh-btn" onClick={fetchProducts} title="Refresh list"><RefreshCw size={18} /></button>
          </div>
        </div>
      </div>

      {error && (
        <div className="error-banner animate-slide-down">
          <AlertTriangle size={20} />
          <span>{error}</span>
          <button onClick={fetchProducts} className="retry-btn">
            <RefreshCw size={14} className="animate-spin-on-hover" /> Retry
          </button>
        </div>
      )}

      {updateError && (
        <div className="error-banner animate-slide-down" style={{ backgroundColor: '#b34747', borderColor: '#800000' }}>
          <AlertTriangle size={20} />
          <span>{updateError}</span>
        </div>
      )}

      {filteredProducts.length === 0 && !error && searchTerm ? (
        <div className="empty-state animate-fade-in">
          <Grid size={60} className="empty-icon" />
          <h3>No products found</h3>
          <p>No products match your search for "{searchTerm}".</p>
          <button className="btn-primary large-btn" onClick={() => setSearchTerm('')}>Clear Search</button>
        </div>
      ) : filteredProducts.length === 0 && !error ? (
        <div className="empty-state animate-fade-in">
          <Grid size={60} className="empty-icon" />
          <h3>No products found</h3>
          <p>Try adjusting your search filters or add a new product.</p>
          <button className="btn-primary large-btn" onClick={() => navigate('/add-products')}><Plus size={20} /> Add New Product</button>
        </div>
      ) : (
        <div className="products-grid">
          {filteredProducts.map((product, i) => (
            <ProductCard
              key={product.id}
              product={product}
              index={i}
              onViewDetails={handleViewDetails}
              onTouchStart={handleTouchStart}
              onTouchEnd={handleTouchEnd}
            />
          ))}
        </div>
      )}

      {selectedProduct && (
        <ProductDetailsModal
          product={selectedProduct}
          onClose={handleCloseDetails}
          onUpdateDetails={handleUpdateProductDetails}
          onImageUpload={handleImageUpload}
          isUpdatingDetails={isUpdatingDetails}
          isUploading={isUploading}
          uploadProgress={uploadProgress}
        />
      )}
    </div>
  );
});

const ProductCard = React.memo(({ product, index, onViewDetails, onTouchStart, onTouchEnd }) => {
  const productName = product.name || product.brand || 'Generic Product';
  const displaySku = product.basesku || product.sku || 'N/A';
  const stock = product.stockQuantity || product.stock || 0;
  const stockClass = stock > 10 ? 'in-stock' : stock > 0 ? 'low-stock' : 'out-of-stock';
  const subCategory = product.subCategory || product.subcategory || 'N/A';
  const imageUrl = product.image || product.images?.[0] || null;
  const offer = product.offerPrice ?? product.offerprice ?? 0;

  const handleCardClick = () => onViewDetails(product);

  return (
    <div
      className="product-card animate-stagger-in"
      style={{ animationDelay: `${index * 0.06}s` }}
      onTouchStart={(e) => onTouchStart(e)}
      onTouchEnd={onTouchEnd}
      onClick={handleCardClick}
    >
      <div className="product-image-wrap">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={productName}
            className="product-image"
            loading="lazy"
            onError={(e) => { e.currentTarget.src = '/fallback-image.png'; }}
          />
        ) : (
          <div className="product-image-fallback">
            <ImageIcon size={24} />
          </div>
        )}
      </div>

      <div className="card-header">
        <div className="product-badge">{product.category || 'Uncategorized'}</div>
        <div className="sku-badge">SKU: {displaySku}</div>
      </div>

      <div className="card-content">
        <div className="product-info">
          <h3 className="product-title">{productName}</h3>
          <p className="product-subcategory">{subCategory}</p>
          <p className="product-color">{product.color || 'N/A'}</p>
          <p className="product-price">
            {product.price ? `₹${product.price}` : 'Price N/A'}
          </p>

          {Number(offer) > 0 && Number(offer) < Number(product.price) && (
            <p className="product-offer-price">
              Offer: ₹{offer} <s className="original-price">₹{product.price}</s>
            </p>
          )}
        </div>

        <p className="product-description">{product.description ? `${product.description.substring(0, 50)}...` : 'No description'}</p>

        <div className="card-actions">
          <button
            className="btn-primary"
            onClick={(e) => { e.stopPropagation(); onViewDetails(product); }}
          >
            <Eye size={14} /> View
          </button>
        </div>
      </div>
    </div>
  );
});

const ProductDetailsModal = React.memo(({
  product,
  onClose,
  onUpdateDetails,
  onImageUpload,
  isUpdatingDetails,
  isUploading,
  uploadProgress,
}) => {
  const [isEditMode, setIsEditMode] = useState(false);
  const [formData, setFormData] = useState({});
  const [activeTab, setActiveTab] = useState('basic');
  const [newSpec, setNewSpec] = useState({ key: '', value: '' });
  const [newTag, setNewTag] = useState('');

  useEffect(() => {
    setFormData({
      name: product.name || '',
      brand: product.brand || '',
      category: product.category || '',
      subCategory: product.subCategory || product.subcategory || '',
      
      price: Number(product.price) || 0,
      offerPrice: Number(product.offerPrice ?? product.offerprice) || 0,
      
      stockQuantity: Number(product.stockQuantity ?? product.stock) || 0,
      
      basesku: product.basesku || product.sku || '',
      hsnCode: product.hsnCode ?? product.hsncode ?? '',
      
      description: product.description || '',
      color: product.color || '',
      material: product.material || '',
      pattern: product.pattern || '',
      occasion: product.occasion || '',
      
      'length(cm)': Number(product['length(cm)'] || product.length) || 0,
      'width(cm)': Number(product['width(cm)'] || product.width) || 0,
      'height(cm)': Number(product['height(cm)'] || product.height) || 0,
      'weight(g)': Number(product['weight(g)'] || product.weight) || 0,
      
      careinstructions: product.careinstructions || '',
      cashOnDelivery: product.cashOnDelivery || 'No',
      gender: product.gender || '',
      seourl: product.seourl || '',
      
      images: Array.isArray(product.images) ? product.images : 
              (product.image ? [product.image] : []),
      specifications: Array.isArray(product.specifications) ? product.specifications : [],
      tags: Array.isArray(product.tags) ? product.tags : [],
      sizevariants: Array.isArray(product.sizevariants) ? product.sizevariants : [],
      colorVariants: Array.isArray(product.colorVariants) ? product.colorVariants : [],
    });
    
    setIsEditMode(false);
  }, [product]);

  const handleInputChange = useCallback((e) => {
    const { name, value, type, checked } = e.target;
    
    setFormData(prev => {
      if (type === 'number') {
        return { ...prev, [name]: value === '' ? 0 : Number(value) };
      }
      if (type === 'checkbox') {
        return { ...prev, [name]: checked ? 'Yes' : 'No' };
      }
      return { ...prev, [name]: value };
    });
  }, []);

  const addSpecification = useCallback(() => {
    if (!newSpec.key.trim() || !newSpec.value.trim()) {
      alert('Please fill both key and value');
      return;
    }
    
    setFormData(prev => ({
      ...prev,
      specifications: [...(prev.specifications || []), { ...newSpec }]
    }));
    setNewSpec({ key: '', value: '' });
  }, [newSpec]);

  const removeSpecification = useCallback((index) => {
    setFormData(prev => ({
      ...prev,
      specifications: (prev.specifications || []).filter((_, i) => i !== index)
    }));
  }, []);

  const addTag = useCallback(() => {
    const tag = newTag.trim();
    if (!tag) {
      alert('Please enter a tag');
      return;
    }
    
    if ((formData.tags || []).includes(tag)) {
      alert('Tag already exists');
      return;
    }
    
    setFormData(prev => ({
      ...prev,
      tags: [...(prev.tags || []), tag]
    }));
    setNewTag('');
  }, [newTag, formData.tags]);

  const removeTag = useCallback((tagToRemove) => {
    setFormData(prev => ({
      ...prev,
      tags: (prev.tags || []).filter(tag => tag !== tagToRemove)
    }));
  }, []);

  const removeImage = useCallback((urlToRemove) => {
    setFormData(prev => ({
      ...prev,
      images: (prev.images || []).filter(url => url !== urlToRemove)
    }));
  }, []);

  const handleSave = useCallback(async () => {
    try {
      await onUpdateDetails(product.id, formData);
      setIsEditMode(false);
    } catch (e) {
      // Error is handled in parent
    }
  }, [product.id, formData, onUpdateDetails]);

  const handleFileUpload = useCallback((e) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      onImageUpload(files, product.id);
    }
  }, [onImageUpload, product.id]);

  const handleBackdropClick = useCallback((e) => {
    if (e.target === e.currentTarget && !isUpdatingDetails) onClose();
  }, [onClose, isUpdatingDetails]);

  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape' && !isUpdatingDetails) onClose();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onClose, isUpdatingDetails]);

  const displayData = isEditMode ? formData : product;
  const stock = displayData.stockQuantity || displayData.stock || 0;
  const stockClass = stock > 10 ? 'in-stock' : stock > 0 ? 'low-stock' : 'out-of-stock';

  return (
    <div className="modal-backdrop" onClick={handleBackdropClick}>
      <div className="product-details-modal animate-modal-in">
        <div className="modal-header">
          <div className="header-left" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <h2 style={{ fontSize: '1.25rem' }}>{displayData.name || 'Product Details'}</h2>
            {isEditMode && (
              <span style={{
                background: '#3b82f6',
                color: 'white',
                padding: '0.2rem 0.6rem',
                borderRadius: '12px',
                fontSize: '0.7rem',
                fontWeight: '600'
              }}>
                Editing
              </span>
            )}
          </div>
          <button onClick={onClose} className="close-modal-btn" disabled={isUpdatingDetails}>
            <X size={20} />
          </button>
        </div>

        {isEditMode && (
          <div style={{
            display: 'flex',
            gap: '0.25rem',
            padding: '0.5rem 1rem',
            borderBottom: '1px solid #334155',
            background: '#1a2634',
            flexWrap: 'wrap'
          }}>
            {['basic', 'pricing', 'media', 'details'].map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                style={{
                  padding: '0.4rem 0.75rem',
                  background: activeTab === tab ? '#3b82f6' : 'transparent',
                  color: activeTab === tab ? 'white' : '#94a3b8',
                  border: activeTab === tab ? 'none' : '1px solid #334155',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '0.75rem',
                  fontWeight: '500',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.3rem'
                }}
              >
                {tab === 'basic' && <Info size={12} />}
                {tab === 'pricing' && <Tag size={12} />}
                {tab === 'media' && <ImageIcon size={12} />}
                {tab === 'details' && <Package size={12} />}
                <span>{tab.charAt(0).toUpperCase() + tab.slice(1)}</span>
              </button>
            ))}
          </div>
        )}

        <div className="modal-content" style={{ 
          gridTemplateColumns: isEditMode && activeTab !== 'media' ? '200px 1fr' : '1fr',
          gap: '1rem',
          padding: '1rem'
        }}>
          {(activeTab === 'media' || !isEditMode) && (
            <div className="modal-image-column">
              {displayData.images?.length > 0 ? (
                <div>
                  <img 
                    src={displayData.images[0]} 
                    alt={displayData.name} 
                    className="modal-product-image"
                    style={{ height: '180px' }}
                    onError={(e) => e.currentTarget.src = '/fallback-image.png'}
                  />
                  {displayData.images.length > 1 && (
                    <div style={{ display: 'flex', gap: '0.3rem', marginTop: '0.3rem' }}>
                      {displayData.images.slice(1, 4).map((img, idx) => (
                        <img 
                          key={idx}
                          src={img}
                          alt={`Thumbnail ${idx + 2}`}
                          style={{
                            width: '45px',
                            height: '45px',
                            objectFit: 'cover',
                            borderRadius: '4px',
                            border: '1px solid #334155'
                          }}
                          onError={(e) => e.currentTarget.src = '/fallback-image.png'}
                        />
                      ))}
                      {displayData.images.length > 4 && (
                        <div style={{
                          width: '45px',
                          height: '45px',
                          background: '#334155',
                          borderRadius: '4px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: '#94a3b8',
                          fontSize: '0.7rem',
                          border: '1px solid #475569'
                        }}>
                          +{displayData.images.length - 4}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="modal-image-fallback" style={{ height: '180px' }}>
                  <ImageIcon size={36} />
                  <p style={{ fontSize: '0.8rem' }}>No Image</p>
                </div>
              )}

              {isEditMode && activeTab === 'media' && (
                <div style={{ marginTop: '0.75rem' }}>
                  <label htmlFor="edit-image-upload" style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.3rem',
                    padding: '0.5rem 1rem',
                    background: '#334155',
                    border: '1px solid #475569',
                    borderRadius: '6px',
                    color: '#cbd5e1',
                    cursor: 'pointer',
                    fontSize: '0.75rem',
                    fontWeight: '500',
                    width: '100%',
                    justifyContent: 'center'
                  }}>
                    <Upload size={14} /> Add Images
                  </label>
                  <input
                    id="edit-image-upload"
                    type="file"
                    multiple
                    accept="image/*"
                    onChange={handleFileUpload}
                    style={{ display: 'none' }}
                    disabled={isUploading}
                  />
                  
                  {isUploading && (
                    <div style={{ marginTop: '0.75rem' }}>
                      <div style={{
                        width: '100%',
                        height: '3px',
                        background: '#334155',
                        borderRadius: '2px',
                        overflow: 'hidden'
                      }}>
                        <div style={{
                          width: `${uploadProgress}%`,
                          height: '100%',
                          background: '#3b82f6',
                          transition: 'width 0.3s'
                        }} />
                      </div>
                      <p style={{ color: '#94a3b8', fontSize: '0.7rem', marginTop: '0.25rem' }}>
                        {uploadProgress}%
                      </p>
                    </div>
                  )}

                  {formData.images?.length > 0 && (
                    <div style={{ marginTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                      {formData.images.map((img, idx) => (
                        <div key={idx} style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.3rem',
                          padding: '0.3rem',
                          background: '#334155',
                          borderRadius: '4px',
                          border: '1px solid #475569'
                        }}>
                          <img src={img} alt="" style={{ width: '30px', height: '30px', objectFit: 'cover', borderRadius: '4px' }} />
                          <span style={{ flex: 1, color: '#94a3b8', fontSize: '0.7rem' }}>Image {idx + 1}</span>
                          <button 
                            onClick={() => removeImage(img)}
                            style={{
                              background: 'transparent',
                              border: 'none',
                              color: '#ef4444',
                              cursor: 'pointer',
                              padding: '0.2rem'
                            }}
                          >
                            <X size={12} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="modal-details-section">
            {!isEditMode ? (
              <div className="detail-grid" style={{ gap: '0.75rem' }}>
                <div className="detail-item" style={{ padding: '0.6rem' }}><label style={{ fontSize: '0.7rem' }}>Product:</label><span style={{ fontSize: '0.85rem' }} className="product-name-highlight">{displayData.name}</span></div>
                <div className="detail-item" style={{ padding: '0.6rem' }}><label style={{ fontSize: '0.7rem' }}>Brand:</label><span style={{ fontSize: '0.85rem' }}>{displayData.brand || 'N/A'}</span></div>
                <div className="detail-item" style={{ padding: '0.6rem' }}><label style={{ fontSize: '0.7rem' }}>Category:</label><span style={{ fontSize: '0.85rem' }}>{displayData.category || 'N/A'}</span></div>
                <div className="detail-item" style={{ padding: '0.6rem' }}><label style={{ fontSize: '0.7rem' }}>Sub:</label><span style={{ fontSize: '0.85rem' }}>{displayData.subCategory || displayData.subcategory || 'N/A'}</span></div>
                <div className="detail-item" style={{ padding: '0.6rem' }}><label style={{ fontSize: '0.7rem' }}>Price:</label><span style={{ fontSize: '0.85rem' }} className="price-highlight">₹{displayData.price || 0}</span></div>
                <div className="detail-item" style={{ padding: '0.6rem' }}><label style={{ fontSize: '0.7rem' }}>Offer:</label><span style={{ fontSize: '0.85rem' }} className="offer-price">₹{displayData.offerPrice || displayData.offerprice || 0}</span></div>
                <div className="detail-item" style={{ padding: '0.6rem' }}><label style={{ fontSize: '0.7rem' }}>Stock:</label><span style={{ fontSize: '0.85rem' }} className={`stock-status ${stockClass}`}>{stock}</span></div>
                <div className="detail-item" style={{ padding: '0.6rem' }}><label style={{ fontSize: '0.7rem' }}>SKU:</label><span style={{ fontSize: '0.85rem' }} className="sku-code">{displayData.basesku || displayData.sku || 'N/A'}</span></div>
                <div className="detail-item" style={{ padding: '0.6rem' }}><label style={{ fontSize: '0.7rem' }}>Color:</label><span style={{ fontSize: '0.85rem' }}>{displayData.color || 'N/A'}</span></div>
                
                {displayData['length(cm)'] > 0 && (
                  <div className="detail-item" style={{ padding: '0.6rem' }}><label style={{ fontSize: '0.7rem' }}>Dimensions:</label>
                    <span style={{ fontSize: '0.75rem' }}>{displayData['length(cm)']}x{displayData['width(cm)']}x{displayData['height(cm)']}cm</span>
                  </div>
                )}
                
                <div className="detail-item full-width" style={{ padding: '0.6rem' }}>
                  <label style={{ fontSize: '0.7rem' }}>Description:</label>
                  <div className="full-description" style={{ fontSize: '0.75rem', padding: '0.5rem' }}>{displayData.description || 'No description'}</div>
                </div>
                
                {displayData.tags?.length > 0 && (
                  <div className="detail-item full-width" style={{ padding: '0.6rem' }}>
                    <label style={{ fontSize: '0.7rem' }}>Tags:</label>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
                      {displayData.tags.map((tag, idx) => (
                        <span key={idx} style={{
                          background: '#334155',
                          padding: '0.15rem 0.4rem',
                          borderRadius: '12px',
                          fontSize: '0.65rem'
                        }}>{tag}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="edit-mode-content">
                {activeTab === 'basic' && (
                  <div className="edit-section">
                    <h4 style={{ margin: '0 0 0.75rem 0', fontSize: '0.9rem' }}>Basic Info</h4>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.5rem' }}>
                      <div>
                        <label style={{ fontSize: '0.7rem' }}>Name</label>
                        <input type="text" name="name" value={formData.name || ''} onChange={handleInputChange} 
                          style={{ padding: '0.4rem', fontSize: '0.75rem' }} />
                      </div>
                      <div>
                        <label style={{ fontSize: '0.7rem' }}>Brand</label>
                        <input type="text" name="brand" value={formData.brand || ''} onChange={handleInputChange} 
                          style={{ padding: '0.4rem', fontSize: '0.75rem' }} />
                      </div>
                      <div>
                        <label style={{ fontSize: '0.7rem' }}>Category</label>
                        <input type="text" name="category" value={formData.category || ''} onChange={handleInputChange} 
                          style={{ padding: '0.4rem', fontSize: '0.75rem' }} />
                      </div>
                      <div>
                        <label style={{ fontSize: '0.7rem' }}>Subcategory</label>
                        <input type="text" name="subCategory" value={formData.subCategory || ''} onChange={handleInputChange} 
                          style={{ padding: '0.4rem', fontSize: '0.75rem' }} />
                      </div>
                      <div>
                        <label style={{ fontSize: '0.7rem' }}>Color</label>
                        <input type="text" name="color" value={formData.color || ''} onChange={handleInputChange} 
                          style={{ padding: '0.4rem', fontSize: '0.75rem' }} />
                      </div>
                      <div>
                        <label style={{ fontSize: '0.7rem' }}>Material</label>
                        <input type="text" name="material" value={formData.material || ''} onChange={handleInputChange} 
                          style={{ padding: '0.4rem', fontSize: '0.75rem' }} />
                      </div>
                      <div style={{ gridColumn: 'span 2' }}>
                        <label style={{ fontSize: '0.7rem' }}>Description</label>
                        <textarea name="description" rows="2" value={formData.description || ''} onChange={handleInputChange} 
                          style={{ padding: '0.4rem', fontSize: '0.75rem' }} />
                      </div>
                    </div>
                  </div>
                )}

                {activeTab === 'pricing' && (
                  <div className="edit-section">
                    <h4 style={{ margin: '0 0 0.75rem 0', fontSize: '0.9rem' }}>Pricing & Stock</h4>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.5rem' }}>
                      <div>
                        <label style={{ fontSize: '0.7rem' }}>Price</label>
                        <input type="number" name="price" value={formData.price || 0} onChange={handleInputChange} 
                          style={{ padding: '0.4rem', fontSize: '0.75rem' }} />
                      </div>
                      <div>
                        <label style={{ fontSize: '0.7rem' }}>Offer Price</label>
                        <input type="number" name="offerPrice" value={formData.offerPrice || 0} onChange={handleInputChange} 
                          style={{ padding: '0.4rem', fontSize: '0.75rem' }} />
                      </div>
                      <div>
                        <label style={{ fontSize: '0.7rem' }}>Stock</label>
                        <input type="number" name="stockQuantity" value={formData.stockQuantity || 0} onChange={handleInputChange} 
                          style={{ padding: '0.4rem', fontSize: '0.75rem' }} />
                      </div>
                      <div>
                        <label style={{ fontSize: '0.7rem' }}>SKU</label>
                        <input type="text" name="basesku" value={formData.basesku || ''} onChange={handleInputChange} 
                          style={{ padding: '0.4rem', fontSize: '0.75rem' }} />
                      </div>
                      <div>
                        <label style={{ fontSize: '0.7rem' }}>HSN Code</label>
                        <input type="text" name="hsnCode" value={formData.hsnCode || ''} onChange={handleInputChange} 
                          style={{ padding: '0.4rem', fontSize: '0.75rem' }} />
                      </div>
                      <div>
                        <label style={{ fontSize: '0.7rem' }}>COD</label>
                        <select name="cashOnDelivery" value={formData.cashOnDelivery || 'No'} onChange={handleInputChange} 
                          style={{ padding: '0.4rem', fontSize: '0.75rem' }}>
                          <option value="Yes">Yes</option>
                          <option value="No">No</option>
                        </select>
                      </div>
                    </div>
                  </div>
                )}

                {activeTab === 'details' && (
                  <div className="edit-section">
                    <h4 style={{ margin: '0 0 0.75rem 0', fontSize: '0.9rem' }}>Dimensions & Tags</h4>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.5rem', marginBottom: '0.75rem' }}>
                      <div>
                        <label style={{ fontSize: '0.7rem' }}>Length (cm)</label>
                        <input type="number" name="length(cm)" value={formData['length(cm)'] || 0} onChange={handleInputChange} 
                          style={{ padding: '0.4rem', fontSize: '0.75rem' }} />
                      </div>
                      <div>
                        <label style={{ fontSize: '0.7rem' }}>Width (cm)</label>
                        <input type="number" name="width(cm)" value={formData['width(cm)'] || 0} onChange={handleInputChange} 
                          style={{ padding: '0.4rem', fontSize: '0.75rem' }} />
                      </div>
                      <div>
                        <label style={{ fontSize: '0.7rem' }}>Height (cm)</label>
                        <input type="number" name="height(cm)" value={formData['height(cm)'] || 0} onChange={handleInputChange} 
                          style={{ padding: '0.4rem', fontSize: '0.75rem' }} />
                      </div>
                      <div>
                        <label style={{ fontSize: '0.7rem' }}>Weight (g)</label>
                        <input type="number" name="weight(g)" value={formData['weight(g)'] || 0} onChange={handleInputChange} 
                          style={{ padding: '0.4rem', fontSize: '0.75rem' }} />
                      </div>
                    </div>

                    <h4 style={{ fontSize: '0.8rem', margin: '0.5rem 0' }}>Tags</h4>
                    <div style={{ marginBottom: '0.75rem' }}>
                      <div style={{ display: 'flex', gap: '0.25rem', marginBottom: '0.5rem' }}>
                        <input type="text" value={newTag} onChange={(e) => setNewTag(e.target.value)} placeholder="Add tag"
                          style={{ flex: 1, padding: '0.4rem', fontSize: '0.75rem' }} />
                        <button onClick={addTag} style={{ padding: '0.4rem 0.75rem', fontSize: '0.7rem' }}>Add</button>
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
                        {(formData.tags || []).map((tag, idx) => (
                          <span key={idx} style={{ padding: '0.2rem 0.5rem', fontSize: '0.7rem' }}>
                            {tag}
                            <button onClick={() => removeTag(tag)} style={{ marginLeft: '0.25rem' }}><X size={10} /></button>
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="modal-actions" style={{ padding: '0.75rem 1rem' }}>
              {isEditMode ? (
                <>
                  <button className="btn-primary" onClick={handleSave} disabled={isUpdatingDetails || isUploading}
                    style={{ padding: '0.5rem', fontSize: '0.8rem' }}>
                    {isUpdatingDetails ? 'Saving...' : <><Save size={14} /> Save</>}
                  </button>
                  <button className="btn-outline" onClick={() => { setIsEditMode(false); setFormData({...product}); }} 
                    disabled={isUpdatingDetails} style={{ padding: '0.5rem', fontSize: '0.8rem' }}>
                    <X size={14} /> Cancel
                  </button>
                </>
              ) : (
                <>
                  <button className="btn-outline" onClick={() => setIsEditMode(true)} style={{ padding: '0.5rem', fontSize: '0.8rem' }}>
                    <Edit size={14} /> Edit
                  </button>
                  <button className="btn-primary" onClick={onClose} style={{ padding: '0.5rem', fontSize: '0.8rem' }}>
                    Close
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});

export default SellerProducts;