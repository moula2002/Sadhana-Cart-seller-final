import React, { useMemo, useState, useEffect } from 'react';
import {
  Plus, X, Upload, Eye, Package, Tag, Ruler, Info,
  Globe, Palette, ShoppingBag,
  Hash, Target, Zap, Shield, Award, FileText, Star,
  Check, AlertCircle, Clock, Image as ImageIcon, Layers,
  Filter, PackageOpen, Truck,
  Settings, Calendar, Users
} from 'lucide-react';
import { collection, doc, writeBatch, serverTimestamp, getDocs, query, where } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, auth, storage } from '../config/firebase';

/* ------------------------------- Utilities ------------------------------- */
const generateSearchKeywords = (form) => {
  const texts = [];
  if (form.name) texts.push(form.name);
  if (form.brand) texts.push(form.brand);
  if (form.sku) texts.push(form.sku);
  if (form.basesku) texts.push(form.basesku);
  if (form.description) texts.push(form.description);
  if (form.color) texts.push(form.color);
  if (form.material) texts.push(form.material);
  if (form.occasion) texts.push(form.occasion);
  if (form.pattern) texts.push(form.pattern);
  if (form.offerprice) texts.push(String(form.offerprice));
  if (form.price) texts.push(String(form.price));
  (form.tags || []).forEach((t) => t && texts.push(t));
  (form.specifications || []).forEach((s) => {
    if (s.key) texts.push(s.key);
    if (s.value) texts.push(s.value);
  });
  if (form['height(cm)']) texts.push(String(form['height(cm)']));
  if (form['length(cm)']) texts.push(String(form['length(cm)']));
  if (form['width(cm)']) texts.push(String(form['width(cm)']));
  if (form['weight(g)']) texts.push(String(form['weight(g)']));

  // Add category and subcategory to search
  if (form.category) texts.push(form.category);
  if (form.subcategory) texts.push(form.subcategory);

  const combined = texts.join(' ').toLowerCase();
  const rawTokens = combined.split(/\W+/).map((t) => t.trim()).filter(Boolean);
  const name = (form.name || '').toLowerCase();
  const nameTokens = [];
  const words = name.split(/\s+/).filter(Boolean);

  words.forEach((w) => {
    if (w.length >= 2) nameTokens.push(w);
    for (let i = 2; i <= Math.min(w.length, 12); i++) {
      nameTokens.push(w.slice(0, i));
    }
  });

  const tokens = [
    ...rawTokens,
    ...nameTokens,
    ...((form.searchkeywords || []) || []).map((k) => (k + '').toLowerCase())
  ];

  const set = new Set();
  tokens.forEach((t) => {
    if (!t) return;
    const clean = t.replace(/[_-]+/g, '');
    if (clean.length >= 2) set.add(clean);
  });

  return Array.from(set);
};

const resolveSellerId = () => {
  try {
    const rawSeller = localStorage.getItem('seller');
    if (rawSeller) {
      const s = JSON.parse(rawSeller);
      if (s?.sellerId) return s.sellerId;
      if (s?.uid) return s.uid;
      if (s?.id) return s.id;
    }
  } catch { }

  try {
    const rawUser = localStorage.getItem('user');
    if (rawUser) {
      const u = JSON.parse(rawUser);
      if (u?.sellerId) return u.sellerId;
      if (u?.uid) return u.uid;
      if (u?.id) return u.id;
    }
  } catch { }

  const uid = auth?.currentUser?.uid;
  if (uid) return uid;
  return '';
};

/* -------------------------------- Defaults ------------------------------- */
const initialForm = {
  basesku: '',
  brand: '',
  careinstructions: '',
  color: '',
  description: '',
  gender: '',
  'height(cm)': '',
  hsncode: '',
  images: [],
  'length(cm)': '',
  material: '',
  name: '',
  name_lower: '',
  occasion: '',
  offerprice: '',
  pattern: '',
  price: '',
  searchkeywords: [],
  sellerid: '',
  seourl: '',
  sizevariants: [],
  stock: '',
  'weight(g)': '',
  'width(cm)': '',
  sku: '',
  category: '',
  subcategory: '',
  specifications: [],
  tags: [],
  warranty: '',
  returnPolicy: '',
  shippingInfo: '',
  manufacturer: '',
  country: '',
  discount: '',
  rating: '',
  popularity: '',
  isFeatured: false,
  isBestseller: false,
  isNewArrival: false,
  isSale: false,
  videoUrl: '',
  colorVariants: [],
  sizeChart: '',
  metaTitle: '',
  metaDescription: '',
  metaKeywords: '',
};


// Size variants
const sizeOptions = {
  'Clothing': ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'],
  'Footwear': ['6', '7', '8', '9', '10', '11', '12', '13'],
  'Electronics': ['Standard', 'Mini', 'Large', 'XL'],
  'Home': ['Small', 'Medium', 'Large', 'Extra Large'],
  'Generic': ['One Size', 'Customizable']
};

/* ------------------------------ View Modal ------------------------------- */
const ViewProductModal = ({ open, onClose, product, categories = [] }) => {
  if (!open || !product) return null;

  const getCategoryIcon = (categoryName) => {
    const category = categories.find(c => c.name === categoryName);
    return category?.icon || <Package className="w-4 h-4" />;
  };

  const renderField = (label, value, Icon = null) => (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5 text-xs text-gray-400">
        {Icon && <Icon className="w-3 h-3" />}
        {label}
      </div>
      <div className="text-sm text-gray-100 font-medium break-words">
        {value || '—'}
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[9999] bg-black/90 backdrop-blur-lg flex items-center justify-center p-4">
      <div className="relative w-full max-w-6xl bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 rounded-2xl border border-gray-700/50 shadow-2xl overflow-hidden">
        {/* Decorative Elements */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500"></div>
        <div className="absolute -top-24 -right-24 w-48 h-48 bg-blue-500/10 rounded-full blur-3xl"></div>
        <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-purple-500/10 rounded-full blur-3xl"></div>

        {/* Header */}
        <div className="relative px-8 py-6 border-b border-gray-700/50 bg-gradient-to-r from-gray-800/80 to-gray-900/80 backdrop-blur-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl shadow-lg">
                <Eye className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-white">Product Preview</h2>
                <p className="text-gray-400 text-sm mt-1">Complete product details</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-3 bg-gray-800/50 hover:bg-red-500/20 border border-gray-700 hover:border-red-500/30 rounded-xl transition-all duration-300 group"
            >
              <X className="w-5 h-5 text-gray-400 group-hover:text-red-400 transition-colors" />
            </button>
          </div>
        </div>

        <div className="p-8 space-y-8 max-h-[70vh] overflow-y-auto">
          {/* Images Gallery */}
          {product.images?.length > 0 ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {product.images.map((img, i) => (
                <div key={i} className="group relative rounded-xl overflow-hidden border-2 border-gray-700 hover:border-blue-500 transition-all duration-300">
                  <div className="aspect-square bg-gray-800">
                    <img
                      src={img}
                      alt={`Product ${i + 1}`}
                      className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                    />
                  </div>
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-end justify-center p-4">
                    <span className="text-white text-sm font-medium">Image {i + 1}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 border-2 border-dashed border-gray-700/50 rounded-2xl bg-gradient-to-br from-gray-800/30 to-gray-900/30">
              <ImageIcon className="w-12 h-12 text-gray-600 mx-auto mb-4" />
              <p className="text-gray-500 font-medium">No images uploaded</p>
            </div>
          )}

          {/* Main Details */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Left Column */}
            <div className="space-y-6">
              <div className="bg-gradient-to-br from-gray-800/50 to-gray-900/50 rounded-2xl p-6 border border-gray-700/50 backdrop-blur-sm">
                <div className="flex items-center gap-3 mb-6">
                  <div className="p-2 bg-blue-500/20 rounded-lg">
                    <Package className="w-5 h-5 text-blue-400" />
                  </div>
                  <h3 className="text-lg font-bold text-white">Product Information</h3>
                </div>
                <div className="space-y-4">
                  {renderField('Name', product.name, Info)}
                  {renderField('Product ID', product.productId, Hash)}
                  {renderField('Seller ID', product.sellerid, Shield)}
                  {renderField('Brand', product.brand, Award)}
                  {renderField('Base SKU', product.basesku)}
                  {renderField('SKU', product.sku)}
                </div>
              </div>

              <div className="bg-gradient-to-br from-gray-800/50 to-gray-900/50 rounded-2xl p-6 border border-gray-700/50 backdrop-blur-sm">
                <div className="flex items-center gap-3 mb-6">
                  <div className="p-2 bg-green-500/20 rounded-lg">
                    <Tag className="w-5 h-5 text-green-400" />
                  </div>
                  <h3 className="text-lg font-bold text-white">Pricing & Stock</h3>
                </div>
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <div className="text-xs text-gray-400 mb-1">Price</div>
                    <div className="text-2xl font-bold text-green-400">
                      ₹{product.price?.toLocaleString()}
                    </div>
                  </div>
                  {product.offerprice && (
                    <div>
                      <div className="text-xs text-gray-400 mb-1">Offer Price</div>
                      <div className="text-xl font-bold text-yellow-400">
                        ₹{product.offerprice?.toLocaleString()}
                        <span className="text-sm text-gray-500 line-through ml-2">
                          ₹{product.price?.toLocaleString()}
                        </span>
                      </div>
                    </div>
                  )}
                  <div>
                    <div className="text-xs text-gray-400 mb-1">Stock</div>
                    <div className={`text-xl font-bold ${product.stock > 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {product.stock || 0} units
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-400 mb-1">HSN Code</div>
                    <div className="text-xl font-mono text-blue-400">{product.hsncode || '—'}</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Column */}
            <div className="space-y-6">
              <div className="bg-gradient-to-br from-gray-800/50 to-gray-900/50 rounded-2xl p-6 border border-gray-700/50 backdrop-blur-sm">
                <div className="flex items-center gap-3 mb-6">
                  <div className="p-2 bg-purple-500/20 rounded-lg">
                    <Ruler className="w-5 h-5 text-purple-400" />
                  </div>
                  <h3 className="text-lg font-bold text-white">Dimensions & Attributes</h3>
                </div>
                <div className="grid grid-cols-2 gap-6">
                  {renderField('Length', product['length(cm)'] ? `${product['length(cm)']} cm` : '—')}
                  {renderField('Width', product['width(cm)'] ? `${product['width(cm)']} cm` : '—')}
                  {renderField('Height', product['height(cm)'] ? `${product['height(cm)']} cm` : '—')}
                  {renderField('Weight', product['weight(g)'] ? `${product['weight(g)']} g` : '—')}
                  {renderField('Color', product.color, Palette)}
                  {renderField('Material', product.material, Layers)}
                  {renderField('Pattern', product.pattern, Filter)}
                  {renderField('Occasion', product.occasion, Calendar)}
                </div>
              </div>

              <div className="bg-gradient-to-br from-gray-800/50 to-gray-900/50 rounded-2xl p-6 border border-gray-700/50 backdrop-blur-sm">
                <div className="flex items-center gap-3 mb-6">
                  <div className="p-2 bg-yellow-500/20 rounded-lg">
                    <Globe className="w-5 h-5 text-yellow-400" />
                  </div>
                  <h3 className="text-lg font-bold text-white">Category & SEO</h3>
                </div>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <div className="text-xs text-gray-400 mb-1">Category</div>
                      <div className="flex items-center gap-2">
                        {getCategoryIcon(product.category)}
                        <span className="text-white font-medium">{product.category || '—'}</span>
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-400 mb-1">Subcategory</div>
                      <div className="text-white font-medium">{product.subcategory || '—'}</div>
                    </div>
                  </div>
                  {renderField('Gender', product.gender)}
                  {renderField('SEO URL', product.seourl, Globe)}
                </div>
              </div>
            </div>
          </div>

          {/* Description */}
          {product.description && (
            <div className="bg-gradient-to-br from-gray-800/50 to-gray-900/50 rounded-2xl p-6 border border-gray-700/50 backdrop-blur-sm">
              <h3 className="text-lg font-bold text-white mb-4">Description</h3>
              <div className="prose prose-invert max-w-none">
                <p className="text-gray-300 leading-relaxed whitespace-pre-wrap">{product.description}</p>
              </div>
            </div>
          )}

          {/* Specifications */}
          {product.specifications?.length > 0 && (
            <div className="bg-gradient-to-br from-gray-800/50 to-gray-900/50 rounded-2xl p-6 border border-gray-700/50 backdrop-blur-sm">
              <h3 className="text-lg font-bold text-white mb-4">Specifications</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {product.specifications.map((spec, i) => (
                  <div key={i} className="bg-gray-800/50 border border-gray-700 rounded-xl p-4">
                    <div className="text-sm font-medium text-blue-400 mb-1">{spec.key}</div>
                    <div className="text-gray-300 text-sm">{spec.value}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Tags */}
          {product.tags?.length > 0 && (
            <div className="bg-gradient-to-br from-gray-800/50 to-gray-900/50 rounded-2xl p-6 border border-gray-700/50 backdrop-blur-sm">
              <h3 className="text-lg font-bold text-white mb-4">Tags</h3>
              <div className="flex flex-wrap gap-2">
                {product.tags.map((tag, i) => (
                  <span
                    key={i}
                    className="px-4 py-2 bg-gradient-to-r from-blue-500/20 to-purple-500/20 border border-blue-400/30 text-blue-300 rounded-full text-sm font-medium"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-8 py-6 border-t border-gray-700/50 bg-gradient-to-r from-gray-800/80 to-gray-900/80 backdrop-blur-sm">
          <div className="flex justify-end">
            <button
              onClick={onClose}
              className="px-6 py-3 bg-gradient-to-r from-gray-700 to-gray-800 hover:from-gray-600 hover:to-gray-700 text-white font-medium rounded-xl transition-all duration-300 border border-gray-600 hover:border-gray-500"
            >
              Close Preview
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

/* ------------------------------ Main Component ------------------------------ */
const AddProduct = () => {
  const [showForm, setShowForm] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [newSpec, setNewSpec] = useState({ key: '', value: '' });
  const [newTag, setNewTag] = useState('');
  const [formData, setFormData] = useState({ ...initialForm });
  const [detectedSellerId, setDetectedSellerId] = useState('');
  const [lastSavedProduct, setLastSavedProduct] = useState(null);
  const [openViewModal, setOpenViewModal] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [activeSection, setActiveSection] = useState('basic');
  const [selectedColors, setSelectedColors] = useState([]);
  const [sizeVariants, setSizeVariants] = useState([]);
  const [selectedSizeType, setSelectedSizeType] = useState('');


  // Data States for Firebase Collections
  const [categories, setCategories] = useState([]);
  const [allSubcategories, setAllSubcategories] = useState([]);

  // Filtered UI States
  const [filteredSubcategories, setFilteredSubcategories] = useState([]);

  const [loadingCategories, setLoadingCategories] = useState(true);
  const [sellers, setSellers] = useState([]);
  const [loadingSellers, setLoadingSellers] = useState(false);
  const [showSellerDropdown, setShowSellerDropdown] = useState(false);

  const currentUserRaw = typeof window !== 'undefined'
    ? (localStorage.getItem('seller') || localStorage.getItem('user'))
    : null;

  let parsedUser = null;
  try {
    parsedUser = currentUserRaw ? JSON.parse(currentUserRaw) : {};
  } catch {
    parsedUser = {};
  }

  const isAdmin = parsedUser?.role === 'admin' || parsedUser?.isAdmin === true;

  useEffect(() => {
    setShowForm(true);
    const sellerId = resolveSellerId();
    setDetectedSellerId(sellerId);

    // Set the seller ID in form data if available
    if (sellerId) {
      setFormData(prev => ({ ...prev, sellerid: sellerId }));
    }

    fetchAllCategories();

    // If admin, fetch all sellers
    if (isAdmin) {
      fetchAllSellers();
      setShowSellerDropdown(true);
    }
  }, [isAdmin]);

  // Fetch all categories from separate Firebase collections
  const fetchAllCategories = async () => {
    try {
      setLoadingCategories(true);

      // Fetch main categories
      const categoriesCollection = collection(db, 'category');
      const categoriesSnapshot = await getDocs(categoriesCollection);
      const categoriesData = categoriesSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setCategories(categoriesData);

      // Fetch subcategories
      const subcategoriesCollection = collection(db, 'subcategory');
      const subcategoriesSnapshot = await getDocs(subcategoriesCollection);
      const subcategoriesData = subcategoriesSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setAllSubcategories(subcategoriesData);



    } catch (error) {
      console.error('Error fetching categories:', error);
      setMessage({ type: 'error', text: 'Failed to load categories from database' });
    } finally {
      setLoadingCategories(false);
    }
  };

  // Fetch all sellers for admin
  const fetchAllSellers = async () => {
    try {
      setLoadingSellers(true);
      const sellersCollection = collection(db, 'sellers');
      const sellersSnapshot = await getDocs(sellersCollection);
      const sellersData = sellersSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setSellers(sellersData);
    } catch (error) {
      console.error('Error fetching sellers:', error);
      setMessage({ type: 'error', text: 'Failed to load sellers from database' });
    } finally {
      setLoadingSellers(false);
    }
  };

  // Get icon based on category name
  const getCategoryIcon = (categoryName) => {
    const iconMap = {
      'Electronics': <Zap className="w-4 h-4" />,
      'Fashion': <ShoppingBag className="w-4 h-4" />,
      'Home & Kitchen': <PackageOpen className="w-4 h-4" />,
      'Beauty & Health': <Star className="w-4 h-4" />,
      'Sports & Fitness': <Target className="w-4 h-4" />,
      'Books & Stationery': <FileText className="w-4 h-4" />,
      'Toys & Games': <Award className="w-4 h-4" />,
      'Automotive': <Truck className="w-4 h-4" />,
      'Jewelry': <Shield className="w-4 h-4" />,
      'Groceries': <Package className="w-4 h-4" />,
      'Books': <FileText className="w-4 h-4" />,
    };

    return iconMap[categoryName] || <Package className="w-4 h-4" />;
  };

  // Filter subcategories when category changes
  useEffect(() => {
    if (formData.category) {
      const filtered = allSubcategories.filter(sub => sub.category === formData.category);
      setFilteredSubcategories(filtered);
    } else {
      setFilteredSubcategories([]);
    }
    setFormData(prev => ({ ...prev, subcategory: '' }));
  }, [formData.category, allSubcategories]);



  const generatedKeywordsPreview = useMemo(() => generateSearchKeywords(formData), [formData]);

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;

    if (type === 'checkbox') {
      setFormData(prev => ({ ...prev, [name]: checked }));
    } else if (name.includes('.')) {
      const [parent, child] = name.split('.');
      setFormData(prev => ({
        ...prev,
        [parent]: { ...(prev[parent] || {}), [child]: value }
      }));
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
  };

  const handleSellerIdChange = (sellerId) => {
    setFormData(prev => ({ ...prev, sellerid: sellerId }));
    setDetectedSellerId(sellerId);
  };

  const handleImageUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    setIsUploading(true);
    setUploadProgress(0);
    const uploadedUrls = [];

    try {
      const sellerId = formData.sellerid || resolveSellerId() || 'anonymous';
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (file.size > 10 * 1024 * 1024) {
          setMessage({ type: 'error', text: `❌ Image "${file.name}" exceeds 10MB limit` });
          continue;
        }

        const storageRef = ref(storage, `product_images/${sellerId}/${Date.now()}_${file.name}`);
        const snapshot = await uploadBytes(storageRef, file);
        const url = await getDownloadURL(snapshot.ref);
        uploadedUrls.push(url);
        setUploadProgress(Math.floor(((i + 1) / files.length) * 100));
      }

      if (uploadedUrls.length > 0) {
        setFormData(prev => ({
          ...prev,
          images: [...(prev.images || []), ...uploadedUrls]
        }));
        setMessage({ type: 'success', text: `✅ Successfully uploaded ${uploadedUrls.length} image(s)` });
      }
    } catch (error) {
      console.error('Image upload failed:', error);
      setMessage({ type: 'error', text: '❌ Image upload failed. Please try again.' });
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
      if (e.target) e.target.value = null;
    }
  };

  const removeImage = (urlToRemove) => {
    setFormData(prev => ({
      ...prev,
      images: (prev.images || []).filter(url => url !== urlToRemove)
    }));
  };

  const addSpecification = () => {
    if (!newSpec.key.trim() || !newSpec.value.trim()) {
      setMessage({ type: 'error', text: '❌ Please fill both key and value for specification' });
      return;
    }

    setFormData(prev => ({
      ...prev,
      specifications: [...(prev.specifications || []), { ...newSpec }]
    }));
    setNewSpec({ key: '', value: '' });
    setMessage({ type: 'success', text: '✅ Specification added successfully' });
  };

  const removeSpecification = (index) => {
    setFormData(prev => ({
      ...prev,
      specifications: (prev.specifications || []).filter((_, idx) => idx !== index)
    }));
  };

  const addTag = () => {
    const tag = newTag.trim();
    if (!tag) {
      setMessage({ type: 'error', text: '❌ Please enter a tag' });
      return;
    }

    if (tag.length > 50) {
      setMessage({ type: 'error', text: '❌ Tag must be less than 50 characters' });
      return;
    }

    const currentTags = formData.tags || [];
    if (currentTags.includes(tag)) {
      setMessage({ type: 'warning', text: '⚠️ Tag already exists' });
      return;
    }

    setFormData(prev => ({ ...prev, tags: [...currentTags, tag] }));
    setNewTag('');
    setMessage({ type: 'success', text: '✅ Tag added successfully' });
  };

  const removeTag = (tagToRemove) => {
    setFormData(prev => ({
      ...prev,
      tags: (prev.tags || []).filter(tag => tag !== tagToRemove)
    }));
  };

const toggleColor = (color) => {
  setSelectedColors(prev => {
    const isSelected = prev.includes(color);

    const newColors = isSelected
      ? prev.filter(c => c !== color)
      : [...prev, color];

    setFormData(prevForm => ({
      ...prevForm,
      colorVariants: newColors.map(colorName => ({
        name: colorName
      }))
    }));

    return newColors;
  });
};

  const toggleSize = (size) => {
    setSizeVariants(prev => {
      const exists = prev.find(v => v.size === size);

      let updated;

      if (exists) {
        updated = prev.filter(v => v.size !== size);
      } else {
        updated = [
          ...prev,
          {
            size: size,
            price: Number(formData.price) || 0,
            sku: `${formData.basesku || "SKU"}_${size}`,
            stock: Number(formData.stock) || 0
          }
        ];
      }

      setFormData(prevForm => ({
        ...prevForm,
        sizevariants: updated
      }));

      return updated;
    });
  };

  const validateForm = () => {
    const errors = [];

    if (!formData.name?.trim()) errors.push('Product name is required');
    if (!formData.category) errors.push('Category is required');
    if (!formData.subcategory) errors.push('Subcategory is required');
    if (!formData.sellerid?.trim()) errors.push('Seller ID is required');

    const price = Number(formData.price);
    if (isNaN(price) || price <= 0) errors.push('Valid price is required');

    const stock = parseInt(formData.stock, 10);
    if (isNaN(stock) || stock < 0) errors.push('Valid stock quantity is required');

    if (formData.images?.length === 0) errors.push('At least one image is required');

    if (errors.length > 0) {
      return { ok: false, message: errors.join('. ') };
    }

    return { ok: true };
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setMessage({ type: '', text: '' });

    const validation = validateForm();
    if (!validation.ok) {
      setMessage({ type: 'error', text: validation.message });
      setIsLoading(false);
      return;
    }

    try {
      const autoKeywords = generateSearchKeywords(formData);
      const mergedKeywords = Array.from(new Set([...(formData.searchkeywords || []), ...autoKeywords]));
      const name_lower = (formData.name || '').toLowerCase().trim();
      const sellerIdVal = (formData.sellerid || '').trim();

      if (!sellerIdVal) {
        setMessage({ type: 'error', text: '❌ Seller ID is required' });
        setIsLoading(false);
        return;
      }

      // Generate product ID
      const newProductsRef = doc(collection(db, 'products'));
      const newId = newProductsRef.id;

      // Create product document
      const productDoc = {
        ...formData,
        productId: newId,
        sellerid: sellerIdVal,
        name: formData.name.trim(),
        name_lower,
        price: formData.price ? Number(formData.price) : 0,
        offerprice: formData.offerprice ? Number(formData.offerprice) : null,
        stock: formData.stock ? parseInt(formData.stock, 10) : 0,
        discount: formData.discount ? Number(formData.discount) : null,
        searchkeywords: mergedKeywords,
       colorVariants: selectedColors.map(colorName => ({
  name: colorName
})),
        sizevariants: formData.sizevariants || [],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        status: 'active',
        views: 0,
        sales: 0,
        rating: formData.rating ? Number(formData.rating) : 0,
        popularity: formData.popularity ? Number(formData.popularity) : 0,
      };

      // Create seller product document
      const sellerProductDoc = {
        ...productDoc,
        sellerStatus: 'active',
        isActive: true,
      };

      // Use batch write for atomic operation
      const batch = writeBatch(db);
      batch.set(doc(db, 'products', newId), productDoc);
      batch.set(doc(db, 'seller_products', newId), sellerProductDoc);

      // Also add to seller's collection if exists
      if (sellerIdVal) {
        batch.set(doc(db, `sellers/${sellerIdVal}/products`, newId), {
          productId: newId,
          name: productDoc.name,
          price: productDoc.price,
          stock: productDoc.stock,
          status: 'active',
          addedAt: serverTimestamp(),
        });
      }

      await batch.commit();

      // Update state and show success
      setLastSavedProduct({ ...productDoc });
      setOpenViewModal(true);

      // Reset form but keep seller ID
      setFormData({
        ...initialForm,
        sellerid: sellerIdVal // Keep the same seller ID
      });
      setSelectedColors([]);
      setSizeVariants([]);
      setSelectedSizeType('');
      setFilteredSubcategories([]);

      setMessage({
        type: 'success',
        text: `🎉 Product "${productDoc.name}" created successfully! ID: ${newId}`
      });

      // Clear success message after 5 seconds
      setTimeout(() => {
        setMessage(prev => prev.type === 'success' ? { type: '', text: '' } : prev);
      }, 5000);

    } catch (error) {
      console.error('Error creating product:', error);

      let errorMessage = '❌ Failed to create product. Please try again.';
      if (error.code === 'permission-denied') {
        errorMessage = '🔐 Permission denied. Check Firebase rules.';
      } else if (error.code === 'unavailable') {
        errorMessage = '🌐 Service unavailable. Please check your internet connection.';
      } else if (error.code === 'invalid-argument') {
        errorMessage = '📝 Invalid data provided. Please check all fields.';
      } else if (error.message?.includes('quota')) {
        errorMessage = '📊 Storage quota exceeded. Please upgrade your plan.';
      }

      setMessage({ type: 'error', text: errorMessage });
    } finally {
      setIsLoading(false);
    }
  };

  const SectionButton = ({ id, icon: Icon, label, active }) => (
    <button
      type="button"
      onClick={() => setActiveSection(id)}
      className={`flex items-center gap-3 px-5 py-3.5 rounded-xl transition-all duration-300 text-sm font-semibold ${active
        ? 'bg-gradient-to-r from-blue-500 to-purple-600 text-white shadow-xl shadow-blue-500/25 transform scale-105'
        : 'bg-gray-800/50 text-gray-400 hover:text-white hover:bg-gray-700/50 border border-gray-700'
        }`}
    >
      <Icon className="w-5 h-5" />
      {label}
    </button>
  );

  const sectionOrder = ['basic', 'pricing', 'media', 'variants'];

  const handleNext = () => {
    const currentIndex = sectionOrder.indexOf(activeSection);
    if (currentIndex < sectionOrder.length - 1) {
      setActiveSection(sectionOrder[currentIndex + 1]);
    }
  };

  const handlePrevious = () => {
    const currentIndex = sectionOrder.indexOf(activeSection);
    if (currentIndex > 0) {
      setActiveSection(sectionOrder[currentIndex - 1]);
    }
  };
  const ProgressBar = ({ label, value, color = "blue" }) => (
    <div className="w-full">
      <div className="flex justify-between text-xs text-gray-400 mb-1">
        <span>{label}</span>
        <span>{value}%</span>
      </div>
      <div className="w-full bg-gray-800 rounded-full h-2 overflow-hidden">
        <div
          className={`h-full rounded-full bg-gradient-to-r from-${color}-500 to-${color}-600 transition-all duration-300`}
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 text-sm">
      {/* Background Decorative Elements */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-blue-500/10 rounded-full blur-3xl"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-purple-500/10 rounded-full blur-3xl"></div>
        <div className="absolute top-1/4 left-1/4 w-60 h-60 bg-green-500/5 rounded-full blur-3xl"></div>
      </div>

      <div className="relative max-w-7xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="bg-gradient-to-r from-gray-800/80 to-gray-900/80 backdrop-blur-lg rounded-2xl border border-gray-700/50 p-6 mb-8 shadow-2xl">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl shadow-lg">
                <Package className="w-7 h-7 text-white" />
              </div>
              <div>
                <h1 className="text-2xl lg:text-3xl font-bold text-white">
                  Add New Product
                </h1>
                <p className="text-gray-400 text-sm mt-1">
                  Fill in the details to add a new product to your inventory
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-4">
              {detectedSellerId && (
                <div className="px-4 py-2.5 bg-gradient-to-r from-emerald-500/20 to-emerald-600/20 border border-emerald-500/30 rounded-xl">
                  <div className="flex items-center gap-2">
                    <Shield className="w-4 h-4 text-emerald-400" />
                    <span className="text-emerald-300 font-medium">Seller ID: {detectedSellerId}</span>
                  </div>
                </div>
              )}

              {lastSavedProduct && (
                <button
                  onClick={() => setOpenViewModal(true)}
                  className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-blue-500/20 to-blue-600/20 hover:from-blue-500/30 hover:to-blue-600/30 border border-blue-500/30 hover:border-blue-400/50 text-blue-300 rounded-xl transition-all duration-300 group"
                >
                  <Eye className="w-4 h-4 group-hover:scale-110 transition-transform" />
                  <span className="text-sm font-medium">View Last Product</span>
                </button>
              )}

              <button
                onClick={() => setShowForm(!showForm)}
                className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-gray-700 to-gray-800 hover:from-gray-600 hover:to-gray-700 text-white rounded-xl font-medium transition-all duration-300 border border-gray-600 hover:border-gray-500"
              >
                {showForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                {showForm ? 'Close Form' : 'Add Product'}
              </button>
            </div>
          </div>

          {/* Stats Bar */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
            <div className="bg-gray-800/50 backdrop-blur-sm border border-gray-700/50 rounded-xl p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs text-gray-400">Required Fields</div>
                  <div className="text-xl font-bold text-white mt-1">9/13</div>
                </div>
                <div className="p-2 bg-blue-500/20 rounded-lg">
                  <Check className="w-5 h-5 text-blue-400" />
                </div>
              </div>
              <ProgressBar value={69} color="blue" />
            </div>

            <div className="bg-gray-800/50 backdrop-blur-sm border border-gray-700/50 rounded-xl p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs text-gray-400">Images</div>
                  <div className="text-xl font-bold text-white mt-1">{formData.images?.length || 0}/10</div>
                </div>
                <div className="p-2 bg-green-500/20 rounded-lg">
                  <ImageIcon className="w-5 h-5 text-green-400" />
                </div>
              </div>
              <ProgressBar value={(formData.images?.length || 0) * 10} color="green" />
            </div>

            <div className="bg-gray-800/50 backdrop-blur-sm border border-gray-700/50 rounded-xl p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs text-gray-400">Specifications</div>
                  <div className="text-xl font-bold text-white mt-1">{formData.specifications?.length || 0}</div>
                </div>
                <div className="p-2 bg-purple-500/20 rounded-lg">
                  <FileText className="w-5 h-5 text-purple-400" />
                </div>
              </div>
              <ProgressBar value={Math.min((formData.specifications?.length || 0) * 10, 100)} color="purple" />
            </div>

            <div className="bg-gray-800/50 backdrop-blur-sm border border-gray-700/50 rounded-xl p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs text-gray-400">Keywords</div>
                  <div className="text-xl font-bold text-white mt-1">{generatedKeywordsPreview.length}</div>
                </div>
                <div className="p-2 bg-yellow-500/20 rounded-lg">
                  <Hash className="w-5 h-5 text-yellow-400" />
                </div>
              </div>
              <ProgressBar value={Math.min(generatedKeywordsPreview.length, 100)} color="yellow" />
            </div>
          </div>
        </div>

        {/* Message Alert */}
        {message.text && (
          <div className={`relative overflow-hidden rounded-xl border p-4 mb-6 backdrop-blur-sm ${message.type === 'success'
            ? 'bg-gradient-to-r from-green-500/10 to-green-600/10 border-green-500/30'
            : message.type === 'error'
              ? 'bg-gradient-to-r from-red-500/10 to-red-600/10 border-red-500/30'
              : 'bg-gradient-to-r from-yellow-500/10 to-yellow-600/10 border-yellow-500/30'
            }`}>
            <div className="flex items-center gap-3">
              {message.type === 'success' && (
                <div className="p-2 bg-green-500/20 rounded-lg">
                  <Check className="w-5 h-5 text-green-400" />
                </div>
              )}
              {message.type === 'error' && (
                <div className="p-2 bg-red-500/20 rounded-lg">
                  <AlertCircle className="w-5 h-5 text-red-400" />
                </div>
              )}
              <div className="flex-1">
                <p className={`font-medium ${message.type === 'success' ? 'text-green-300' :
                  message.type === 'error' ? 'text-red-300' : 'text-yellow-300'
                  }`}>
                  {message.text}
                </p>
              </div>
              {lastSavedProduct && message.type === 'success' && (
                <button
                  onClick={() => setOpenViewModal(true)}
                  className="px-4 py-2 bg-gradient-to-r from-blue-500/20 to-blue-600/20 hover:from-blue-500/30 hover:to-blue-600/30 border border-blue-500/30 rounded-lg text-blue-300 text-sm font-medium transition-all duration-300 flex items-center gap-2"
                >
                  <Eye className="w-4 h-4" />
                  View
                </button>
              )}
            </div>
          </div>
        )}

        {showForm && (
          <div className="bg-gradient-to-br from-gray-800/80 to-gray-900/80 backdrop-blur-lg rounded-2xl border border-gray-700/50 shadow-2xl overflow-hidden">
            {/* Navigation Tabs */}
            <div className="border-b border-gray-700/50 bg-gradient-to-r from-gray-800 to-gray-900">
              <div className="flex flex-wrap gap-2 p-6">
                <SectionButton id="basic" icon={Package} label="Basic Info" active={activeSection === 'basic'} />
                <SectionButton id="pricing" icon={Tag} label="Pricing & Stock" active={activeSection === 'pricing'} />
                <SectionButton id="media" icon={ImageIcon} label="Media" active={activeSection === 'media'} />
                <SectionButton id="variants" icon={Palette} label="Variants" active={activeSection === 'variants'} />
              </div>
            </div>

            <form onSubmit={handleSubmit} className="p-6">
              {/* Seller ID Dropdown (For Admin) or Display (For Regular Seller) */}
              <div className="mb-6 bg-gradient-to-br from-gray-800/50 to-gray-900/50 rounded-2xl p-6 border border-gray-700/50 backdrop-blur-sm">
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2.5 bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-xl">
                    <Users className="w-5 h-5 text-white" />
                  </div>
                  <h2 className="text-xl font-bold text-white">Seller Information</h2>
                </div>

                {showSellerDropdown ? (
                  <div>
                    <label className="block text-gray-300 text-sm font-medium mb-2">
                      Select Seller ID *
                    </label>
                    {loadingSellers ? (
                      <div className="w-full px-4 py-3 bg-gray-800/50 border-2 border-gray-700/50 rounded-xl flex items-center justify-center">
                        <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                        <span className="ml-2 text-gray-400 text-sm">Loading sellers...</span>
                      </div>
                    ) : (
                      <select
                        name="sellerid"
                        value={formData.sellerid}
                        onChange={(e) => handleSellerIdChange(e.target.value)}
                        className="w-full px-4 py-3 bg-gray-800/50 border-2 border-gray-700/50 rounded-xl text-white text-sm focus:outline-none focus:border-indigo-500 focus:bg-gray-800 transition-all duration-300"
                        required
                      >
                        <option value="">Select Seller ID</option>
                        {sellers.map((seller) => (
                          <option key={seller.id} value={seller.id}>
                            {seller.businessName || seller.name || seller.id} ({seller.id})
                          </option>
                        ))}
                      </select>
                    )}
                    <p className="text-xs text-gray-500 mt-1">
                      {sellers.length === 0 && !loadingSellers
                        ? 'No sellers found in database'
                        : 'Select the seller who will own this product'}
                    </p>
                  </div>
                ) : (
                  <div>
                    <label className="block text-gray-300 text-sm font-medium mb-2">
                      Seller ID
                    </label>
                    <div className="w-full px-4 py-3 bg-gray-800/50 border-2 border-gray-700/50 rounded-xl text-white text-sm">
                      {detectedSellerId || 'Not detected'}
                    </div>
                    <input
                      type="hidden"
                      name="sellerid"
                      value={detectedSellerId}
                      onChange={handleInputChange}
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Auto-detected from your login session
                    </p>
                  </div>
                )}
              </div>

              {/* Basic Information Section */}
              {activeSection === 'basic' && (
                <div className="space-y-6 animate-fadeIn">
                  <div className="bg-gradient-to-br from-gray-800/50 to-gray-900/50 rounded-2xl p-6 border border-gray-700/50 backdrop-blur-sm">
                    <div className="flex items-center gap-3 mb-6">
                      <div className="p-2.5 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl">
                        <Package className="w-5 h-5 text-white" />
                      </div>
                      <h2 className="text-xl font-bold text-white">Basic Information</h2>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <label className="block text-gray-300 text-sm font-medium mb-2">
                          Product Name *
                        </label>
                        <input
                          name="name"
                          value={formData.name}
                          onChange={handleInputChange}
                          className="w-full px-4 py-3 bg-gray-800/50 border-2 border-gray-700/50 rounded-xl text-white text-sm placeholder-gray-400 focus:outline-none focus:border-blue-500 focus:bg-gray-800 transition-all duration-300"
                          placeholder="Enter product name"
                          required
                        />
                        <p className="text-xs text-gray-500 mt-1">Required field. Keep it clear and descriptive.</p>
                      </div>

                      <div>
                        <label className="block text-gray-300 text-sm font-medium mb-2">Brand</label>
                        <input
                          name="brand"
                          value={formData.brand}
                          onChange={handleInputChange}
                          className="w-full px-4 py-3 bg-gray-800/50 border-2 border-gray-700/50 rounded-xl text-white text-sm placeholder-gray-400 focus:outline-none focus:border-blue-500 focus:bg-gray-800 transition-all duration-300"
                          placeholder="Brand name"
                        />
                      </div>

                      <div>
                        <label className="block text-gray-300 text-sm font-medium mb-2">Category *</label>
                        {loadingCategories ? (
                          <div className="w-full px-4 py-3 bg-gray-800/50 border-2 border-gray-700/50 rounded-xl flex items-center justify-center">
                            <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                            <span className="ml-2 text-gray-400 text-sm">Loading categories...</span>
                          </div>
                        ) : (
                          <select
                            name="category"
                            value={formData.category}
                            onChange={handleInputChange}
                            className="w-full px-4 py-3 bg-gray-800/50 border-2 border-gray-700/50 rounded-xl text-white text-sm focus:outline-none focus:border-blue-500 focus:bg-gray-800 transition-all duration-300"
                            required
                          >
                            <option value="">Select Category</option>
                            {categories.map((category) => (
                              <option key={category.id} value={category.name}>
                                {category.name}
                              </option>
                            ))}
                          </select>
                        )}
                        {categories.length === 0 && !loadingCategories && (
                          <p className="text-xs text-red-400 mt-1">No categories found. Please add categories in the admin panel.</p>
                        )}
                      </div>

                      <div>
                        <label className="block text-gray-300 text-sm font-medium mb-2">Subcategory *</label>
                        <select
                          name="subcategory"
                          value={formData.subcategory}
                          onChange={handleInputChange}
                          className="w-full px-4 py-3 bg-gray-800/50 border-2 border-gray-700/50 rounded-xl text-white text-sm focus:outline-none focus:border-blue-500 focus:bg-gray-800 transition-all duration-300"
                          required
                          disabled={!formData.category || filteredSubcategories.length === 0}
                        >
                          <option value="">Select Subcategory</option>
                          {filteredSubcategories.map((subcategory) => (
                            <option key={subcategory.id} value={subcategory.name}>
                              {subcategory.name}
                            </option>
                          ))}
                        </select>
                        {formData.category && filteredSubcategories.length === 0 && (
                          <p className="text-xs text-yellow-400 mt-1">No subcategories available for this category</p>
                        )}
                      </div>



                      <div>
                        <label className="block text-gray-300 text-sm font-medium mb-2">Base SKU</label>
                        <input
                          name="basesku"
                          value={formData.basesku}
                          onChange={handleInputChange}
                          className="w-full px-4 py-3 bg-gray-800/50 border-2 border-gray-700/50 rounded-xl text-white text-sm placeholder-gray-400 focus:outline-none focus:border-blue-500 focus:bg-gray-800 transition-all duration-300"
                          placeholder="Base SKU code"
                        />
                      </div>

                      <div>
                        <label className="block text-gray-300 text-sm font-medium mb-2">SKU</label>
                        <input
                          name="sku"
                          value={formData.sku}
                          onChange={handleInputChange}
                          className="w-full px-4 py-3 bg-gray-800/50 border-2 border-gray-700/50 rounded-xl text-white text-sm placeholder-gray-400 focus:outline-none focus:border-blue-500 focus:bg-gray-800 transition-all duration-300"
                          placeholder="Unique SKU code"
                        />
                      </div>
                    </div>

                    <div className="mt-6">
                      <label className="block text-gray-300 text-sm font-medium mb-2">
                        Description *
                      </label>
                      <textarea
                        name="description"
                        value={formData.description}
                        onChange={handleInputChange}
                        rows={6}
                        className="w-full px-4 py-3 bg-gray-800/50 border-2 border-gray-700/50 rounded-xl text-white text-sm placeholder-gray-400 focus:outline-none focus:border-blue-500 focus:bg-gray-800 transition-all duration-300 resize-none"
                        placeholder="Detailed product description including features, benefits, and specifications..."
                        required
                      />
                      <p className="text-xs text-gray-500 mt-1">Minimum 50 characters recommended for better SEO.</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Pricing & Stock Section */}
              {activeSection === 'pricing' && (
                <div className="space-y-6 animate-fadeIn">
                  <div className="bg-gradient-to-br from-gray-800/50 to-gray-900/50 rounded-2xl p-6 border border-gray-700/50 backdrop-blur-sm">
                    <div className="flex items-center gap-3 mb-6">
                      <div className="p-2.5 bg-gradient-to-br from-green-500 to-green-600 rounded-xl">
                        <Tag className="w-5 h-5 text-white" />
                      </div>
                      <h2 className="text-xl font-bold text-white">Pricing & Stock</h2>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      <div>
                        <label className="block text-gray-300 text-sm font-medium mb-2">
                          Price (₹) *
                        </label>
                        <div className="relative">
                          <span className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400">₹</span>
                          <input
                            name="price"
                            type="number"
                            step="0.01"
                            min="0"
                            value={formData.price}
                            onChange={handleInputChange}
                            className="w-full pl-10 pr-4 py-3 bg-white border-2 border-gray-300 rounded-xl text-gray-800 text-sm focus:outline-none focus:border-green-500 focus:bg-white transition-all duration-300"
                            placeholder="0.00"
                            required
                          />
                        </div>
                        <p className="text-xs text-gray-500 mt-1">Set your base price</p>
                      </div>

                      <div>
                        <label className="block text-gray-300 text-sm font-medium mb-2">Offer Price (₹)</label>
                        <div className="relative">
                          <span className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400">₹</span>
                          <input
                            name="offerprice"
                            type="number"
                            step="0.01"
                            min="0"
                            value={formData.offerprice}
                            onChange={handleInputChange}
                            className="w-full pl-10 pr-4 py-3 bg-white border-2 border-gray-300 rounded-xl text-gray-800 text-sm focus:outline-none focus:border-green-500 focus:bg-white transition-all duration-300"
                            placeholder="0.00"
                          />
                        </div>
                        <p className="text-xs text-gray-500 mt-1">Optional discounted price</p>
                      </div>



                      <div>
                        <label className="block text-gray-300 text-sm font-medium mb-2">
                          Stock Quantity *
                        </label>
                        <input
                          name="stock"
                          type="number"
                          min="0"
                          value={formData.stock}
                          onChange={handleInputChange}
                          className="w-full px-4 py-3 bg-white border-2 border-gray-300 rounded-xl text-gray-800 text-sm focus:outline-none focus:border-green-500 focus:bg-white transition-all duration-300"
                          placeholder="0"
                          required
                        />
                        <p className="text-xs text-gray-500 mt-1">Available units in inventory</p>
                      </div>

                      <div>
                        <label className="block text-gray-300 text-sm font-medium mb-2">HSN Code</label>
                        <input
                          name="hsncode"
                          value={formData.hsncode}
                          onChange={handleInputChange}
                          className="w-full px-4 py-3 bg-white border-2 border-gray-300 rounded-xl text-gray-800 text-sm focus:outline-none focus:border-green-500 focus:bg-white transition-all duration-300"
                          placeholder="HSN Code for taxation"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Media Section */}
              {activeSection === 'media' && (
                <div className="space-y-6 animate-fadeIn">
                  <div className="bg-gradient-to-br from-gray-800/50 to-gray-900/50 rounded-2xl p-6 border border-gray-700/50 backdrop-blur-sm">
                    <div className="flex items-center gap-3 mb-6">
                      <div className="p-2.5 bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl">
                        <ImageIcon className="w-5 h-5 text-white" />
                      </div>
                      <h2 className="text-xl font-bold text-white">Media & Images</h2>
                    </div>

                    {/* Image Upload Area */}
                    <div className="border-3 border-dashed border-gray-700/50 rounded-2xl p-8 text-center bg-gradient-to-br from-gray-800/30 to-gray-900/30 hover:border-purple-500/50 transition-all duration-300 mb-6">
                      <div className="max-w-md mx-auto">
                        <div className="p-4 bg-gradient-to-br from-purple-500/10 to-purple-600/10 rounded-2xl inline-block mb-4">
                          <Upload className="w-12 h-12 text-purple-400" />
                        </div>
                        <h3 className="text-lg font-semibold text-white mb-2">Upload Product Images</h3>
                        <p className="text-gray-400 text-sm mb-6">
                          Drag & drop images or click to browse. Max 10 images, 10MB each.
                        </p>

                        {isUploading ? (
                          <div className="space-y-4">
                            <div className="w-full bg-gray-800 rounded-full h-3 overflow-hidden">
                              <div
                                className="h-full bg-gradient-to-r from-purple-500 to-purple-600 transition-all duration-300"
                                style={{ width: `${uploadProgress}%` }}
                              />
                            </div>
                            <div className="text-purple-300 font-medium">
                              Uploading... {uploadProgress}%
                            </div>
                          </div>
                        ) : (
                          <label htmlFor="image-upload" className="inline-block cursor-pointer">
                            <div className="px-6 py-3.5 bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 text-white font-semibold rounded-xl transition-all duration-300 shadow-lg shadow-purple-500/25">
                              Choose Images
                            </div>
                          </label>
                        )}

                        <input
                          id="image-upload"
                          type="file"
                          multiple
                          accept="image/*"
                          onChange={handleImageUpload}
                          className="hidden"
                          disabled={isUploading}
                        />
                      </div>
                    </div>

                    {/* Image Gallery */}
                    {formData.images?.length > 0 && (
                      <div>
                        <h4 className="text-gray-300 font-medium mb-4">Uploaded Images ({formData.images.length})</h4>
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                          {formData.images.map((imgUrl, i) => (
                            <div key={i} className="group relative aspect-square rounded-xl overflow-hidden border-2 border-gray-700 hover:border-purple-500 transition-all duration-300">
                              <img
                                src={imgUrl}
                                alt={`Product ${i + 1}`}
                                className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                              />
                              <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col items-center justify-end p-4">
                                <span className="text-white text-xs font-medium mb-2">Image {i + 1}</span>
                                <button
                                  type="button"
                                  onClick={() => removeImage(imgUrl)}
                                  className="px-3 py-1.5 bg-gradient-to-r from-red-500 to-red-600 text-white text-xs font-medium rounded-lg hover:from-red-600 hover:to-red-700 transition-all duration-300"
                                >
                                  Remove
                                </button>
                              </div>
                              <div className="absolute top-2 right-2">
                                <span className="px-2 py-1 bg-black/70 text-white text-xs rounded-lg">
                                  {i === 0 ? 'Main' : i + 1}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Variants Section - New Addition */}
              {activeSection === 'variants' && (
                <div className="space-y-6 animate-fadeIn">
                  {/* Dimensions & Attributes from first image */}
                  <div className="bg-gradient-to-br from-gray-800/50 to-gray-900/50 rounded-2xl p-6 border border-gray-700/50 backdrop-blur-sm">
                    <div className="flex items-center gap-3 mb-6">
                      <div className="p-2.5 bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl">
                        <Ruler className="w-5 h-5 text-white" />
                      </div>
                      <h2 className="text-xl font-bold text-white">Dimensions & Attributes</h2>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                      <div>
                        <label className="block text-gray-300 text-sm font-medium mb-2">
                          Length (cm)
                        </label>
                        <input
                          name="length(cm)"
                          type="number"
                          min="0"
                          step="0.1"
                          value={formData['length(cm)']}
                          onChange={handleInputChange}
                          className="w-full px-4 py-3 bg-gray-800/50 border-2 border-gray-700/50 rounded-xl text-white text-sm placeholder-gray-400 focus:outline-none focus:border-purple-500 focus:bg-gray-800 transition-all duration-300"
                          placeholder="0.0"
                        />
                      </div>

                      <div>
                        <label className="block text-gray-300 text-sm font-medium mb-2">
                          Width (cm)
                        </label>
                        <input
                          name="width(cm)"
                          type="number"
                          min="0"
                          step="0.1"
                          value={formData['width(cm)']}
                          onChange={handleInputChange}
                          className="w-full px-4 py-3 bg-gray-800/50 border-2 border-gray-700/50 rounded-xl text-white text-sm placeholder-gray-400 focus:outline-none focus:border-purple-500 focus:bg-gray-800 transition-all duration-300"
                          placeholder="0.0"
                        />
                      </div>

                      <div>
                        <label className="block text-gray-300 text-sm font-medium mb-2">
                          Height (cm)
                        </label>
                        <input
                          name="height(cm)"
                          type="number"
                          min="0"
                          step="0.1"
                          value={formData['height(cm)']}
                          onChange={handleInputChange}
                          className="w-full px-4 py-3 bg-gray-800/50 border-2 border-gray-700/50 rounded-xl text-white text-sm placeholder-gray-400 focus:outline-none focus:border-purple-500 focus:bg-gray-800 transition-all duration-300"
                          placeholder="0.0"
                        />
                      </div>

                      <div>
                        <label className="block text-gray-300 text-sm font-medium mb-2">
                          Weight (g)
                        </label>
                        <input
                          name="weight(g)"
                          type="number"
                          min="0"
                          step="0.1"
                          value={formData['weight(g)']}
                          onChange={handleInputChange}
                          className="w-full px-4 py-3 bg-gray-800/50 border-2 border-gray-700/50 rounded-xl text-white text-sm placeholder-gray-400 focus:outline-none focus:border-purple-500 focus:bg-gray-800 transition-all duration-300"
                          placeholder="0.0"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mt-4">
                      <div>
                        <label className="block text-gray-300 text-sm font-medium mb-2">
                          Color
                        </label>
                        <input
                          name="color"
                          value={formData.color}
                          onChange={handleInputChange}
                          className="w-full px-4 py-3 bg-gray-800/50 border-2 border-gray-700/50 rounded-xl text-white text-sm placeholder-gray-400 focus:outline-none focus:border-purple-500 focus:bg-gray-800 transition-all duration-300"
                          placeholder="e.g., Red, Blue, Black"
                        />
                      </div>

                      <div>
                        <label className="block text-gray-300 text-sm font-medium mb-2">
                          Material
                        </label>
                        <input
                          name="material"
                          value={formData.material}
                          onChange={handleInputChange}
                          className="w-full px-4 py-3 bg-gray-800/50 border-2 border-gray-700/50 rounded-xl text-white text-sm placeholder-gray-400 focus:outline-none focus:border-purple-500 focus:bg-gray-800 transition-all duration-300"
                          placeholder="e.g., Cotton, Leather, Plastic"
                        />
                      </div>

                      <div>
                        <label className="block text-gray-300 text-sm font-medium mb-2">
                          Pattern
                        </label>
                        <input
                          name="pattern"
                          value={formData.pattern}
                          onChange={handleInputChange}
                          className="w-full px-4 py-3 bg-gray-800/50 border-2 border-gray-700/50 rounded-xl text-white text-sm placeholder-gray-400 focus:outline-none focus:border-purple-500 focus:bg-gray-800 transition-all duration-300"
                          placeholder="e.g., Striped, Checked, Solid"
                        />
                      </div>

                      <div>
                        <label className="block text-gray-300 text-sm font-medium mb-2">
                          Occasion
                        </label>
                        <input
                          name="occasion"
                          value={formData.occasion}
                          onChange={handleInputChange}
                          className="w-full px-4 py-3 bg-gray-800/50 border-2 border-gray-700/50 rounded-xl text-white text-sm placeholder-gray-400 focus:outline-none focus:border-purple-500 focus:bg-gray-800 transition-all duration-300"
                          placeholder="e.g., Casual, Formal, Party"
                        />
                      </div>
                    </div>
                  </div>


                  {/* Size Variants */}
                  <div className="bg-gradient-to-br from-gray-800/50 to-gray-900/50 rounded-2xl p-6 border border-gray-700/50 backdrop-blur-sm">
                    <div className="flex items-center gap-3 mb-6">
                      <div className="p-2.5 bg-gradient-to-br from-orange-500 to-orange-600 rounded-xl">
                        <Layers className="w-5 h-5 text-white" />
                      </div>
                      <h2 className="text-xl font-bold text-white">Size Variants</h2>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <label className="block text-gray-300 text-sm font-medium mb-3">
                          Size Type
                        </label>
                        <select
                          value={selectedSizeType}
                          onChange={(e) => setSelectedSizeType(e.target.value)}
                          className="w-full px-4 py-3 bg-gray-800/50 border-2 border-gray-700/50 rounded-xl text-white text-sm focus:outline-none focus:border-orange-500 focus:bg-gray-800 transition-all duration-300"
                        >
                          <option value="">Select Size Type</option>
                          <option value="Clothing">Clothing (XS, S, M, L, XL)</option>
                          <option value="Footwear">Footwear (6, 7, 8, 9, 10)</option>
                          <option value="Electronics">Electronics</option>
                          <option value="Home">Home</option>
                          <option value="Generic">Generic</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-gray-300 text-sm font-medium mb-3">
                          Available Sizes
                        </label>
                        {selectedSizeType ? (
                          <div className="flex flex-wrap gap-2">
                            {sizeOptions[selectedSizeType]?.map((size) => (
                              <button
                                key={size}
                                type="button"
                                onClick={() => toggleSize(size)}
                                className={`px-4 py-2 rounded-xl text-sm font-medium transition-all duration-300 transform hover:scale-105 ${sizeVariants.some(v => v.size === size)
                                    ? 'bg-gradient-to-r from-orange-500 to-pink-500 text-white shadow-lg shadow-orange-500/25'
                                    : 'bg-gray-800/50 border border-gray-700 text-gray-300 hover:border-orange-500'
                                  }`}
                              >
                                {size}
                              </button>
                            ))}
                          </div>
                        ) : (
                          <p className="text-gray-500 text-sm py-3">Select a size type to see available options</p>
                        )}
                      </div>
                    </div>

                    {sizeVariants.length > 0 && (
                      <p className="text-sm text-gray-400 mt-4">
                        Selected sizes: {sizeVariants.map(s => s.size).join(', ')}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Form Actions */}
              <div className="pt-8 border-t border-gray-700/50 flex flex-col sm:flex-row gap-4">

                {/* Previous Button */}
                {activeSection !== "basic" && (
                  <button
                    type="button"
                    onClick={handlePrevious}
                    className="px-8 py-4 bg-gray-700 hover:bg-gray-600 text-white rounded-xl font-medium transition-all duration-300"
                  >
                    Previous
                  </button>
                )}

                {/* Next Button */}
                {activeSection !== "variants" && (
                  <button
                    type="button"
                    onClick={handleNext}
                    className="flex-1 bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 text-white py-4 rounded-xl font-semibold text-base transition-all duration-300"
                  >
                    Next
                  </button>
                )}

                {/* Final Submit Button */}
                {activeSection === "variants" && (
                  <button
                    type="submit"
                    disabled={isLoading || isUploading}
                    className="flex-1 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white py-4 rounded-xl font-semibold text-base disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 shadow-xl shadow-blue-500/25 flex items-center justify-center gap-3"
                  >
                    {isLoading ? "Creating Product..." : "Add Product to Inventory"}
                  </button>
                )}

              </div>
            </form>
          </div>
        )}

        {/* Empty State */}
        {!showForm && (
          <div className="text-center py-16">
            <div className="max-w-md mx-auto">
              <div className="p-6 bg-gradient-to-br from-gray-800/50 to-gray-900/50 rounded-2xl border border-gray-700/50 inline-block mb-6">
                <Package className="w-16 h-16 text-gray-600" />
              </div>
              <h3 className="text-xl font-bold text-white mb-2">Ready to Add Products?</h3>
              <p className="text-gray-400 mb-8">
                Start building your inventory by adding your first product
              </p>
              <button
                onClick={() => setShowForm(true)}
                className="px-8 py-3.5 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white font-semibold rounded-xl transition-all duration-300 shadow-lg shadow-blue-500/25 flex items-center justify-center gap-3 mx-auto"
              >
                <Plus className="w-5 h-5" />
                Add New Product
              </button>
            </div>
          </div>
        )}
      </div>

      {/* View Modal */}
      <ViewProductModal
        open={openViewModal}
        onClose={() => setOpenViewModal(false)}
        product={lastSavedProduct}
        categories={categories}
      />
    </div>
  );
};

export default AddProduct;