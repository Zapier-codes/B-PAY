// components/CountryPickerModal.tsx
import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Modal,
  FlatList,
  StyleSheet,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
  Animated,
  Keyboard,
  TouchableWithoutFeedback,
  SafeAreaView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useInternationalStore } from '@/stores/international-store';

const { width, height } = Dimensions.get('window');

interface CountryPickerModalProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (country: any) => void;
  selectedCountry?: any;
}

const CountryPickerModal: React.FC<CountryPickerModalProps> = ({
  visible,
  onClose,
  onSelect,
  selectedCountry,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filteredCountries, setFilteredCountries] = useState([]);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  
  const modalTranslateY = useRef(new Animated.Value(height)).current;
  const searchInputRef = useRef<TextInput>(null);
  
  const { countries, fetchCountries } = useInternationalStore();
  
  // Initialize countries
  useEffect(() => {
    if (visible) {
      loadCountries();
      // Focus search input after animation
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 300);
    }
  }, [visible]);
  
  // Keyboard listeners
  useEffect(() => {
    const keyboardDidShowListener = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      (e) => {
        setIsKeyboardVisible(true);
        setKeyboardHeight(e.endCoordinates.height);
      }
    );
    
    const keyboardDidHideListener = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => {
        setIsKeyboardVisible(false);
        setKeyboardHeight(0);
      }
    );
    
    return () => {
      keyboardDidShowListener.remove();
      keyboardDidHideListener.remove();
    };
  }, []);
  
  // Filter countries based on search
  useEffect(() => {
    if (countries.length === 0) return;
    
    if (searchTerm.trim()) {
      const filtered = countries.filter(country =>
        (country.title?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
        (country.iso?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
        (country.bpay_iso?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
        (country.prefix?.includes(searchTerm))
      );
      setFilteredCountries(filtered);
    } else {
      setFilteredCountries(countries);
    }
  }, [searchTerm, countries]);
  
  // Animation
  useEffect(() => {
    if (visible) {
      Animated.timing(modalTranslateY, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(modalTranslateY, {
        toValue: height,
        duration: 300,
        useNativeDriver: true,
      }).start(() => {
        setSearchTerm('');
        setFilteredCountries(countries);
      });
    }
  }, [visible]);
  
  const loadCountries = async () => {
    try {
      await fetchCountries();
    } catch (error) {
      console.error('Error loading countries:', error);
    }
  };
  
  const handleCountrySelect = (country: any) => {
    onSelect(country);
    Keyboard.dismiss();
    onClose();
  };
  
  const handleClose = () => {
    Keyboard.dismiss();
    onClose();
  };
  
  const clearSearch = () => {
    setSearchTerm('');
    searchInputRef.current?.focus();
  };
  
  const dismissKeyboard = () => {
    Keyboard.dismiss();
  };
  
  // Render item for FlatList
  const renderCountryItem = ({ item }: { item: any }) => (
    <TouchableOpacity
      style={[
        styles.countryItem,
        selectedCountry?.iso === item.iso && styles.countryItemSelected
      ]}
      onPress={() => handleCountrySelect(item)}
    >
      <Text style={styles.countryFlag}>
        {item.flag_emoji || '🌍'}
      </Text>
      <View style={styles.countryInfo}>
        <Text style={styles.countryName}>
          {item.title}
        </Text>
        <Text style={styles.countryDetails}>
          +{item.prefix} • {item.currency_code || 'USD'}
        </Text>
      </View>
      {selectedCountry?.iso === item.iso && (
        <Ionicons name="checkmark" size={20} color="#FFD700" />
      )}
    </TouchableOpacity>
  );
  
  // List empty component
  const ListEmptyComponent = () => (
    <View style={styles.emptyContainer}>
      <Ionicons name="search-outline" size={48} color="#666" />
      <Text style={styles.emptyText}>No countries found</Text>
      <Text style={styles.emptySubtext}>
        Try searching by country name, code (US, CA, etc.), or dial code (+1, +44, etc.)
      </Text>
    </View>
  );
  
  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="none"
      onRequestClose={handleClose}
      statusBarTranslucent={true}
    >
      <View style={styles.overlay}>
        {/* Dismiss keyboard area outside modal */}
        <TouchableWithoutFeedback onPress={dismissKeyboard}>
          <View style={styles.keyboardDismissArea} />
        </TouchableWithoutFeedback>
        
        {/* KeyboardAvoidingView wraps the entire modal */}
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardAvoidingView}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
        >
          <Animated.View 
            style={[
              styles.modalContainer,
              { 
                transform: [{ translateY: modalTranslateY }],
                // Fixed height - keyboard will push this up
                height: height * 0.8,
              }
            ]}
          >
            <SafeAreaView style={styles.safeArea}>
              {/* Header - Always visible */}
              <View style={styles.header}>
                <View style={styles.headerContent}>
                  <Text style={styles.title}>Select Country</Text>
                  <TouchableOpacity 
                    style={styles.closeButton}
                    onPress={handleClose}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <Ionicons name="close" size={24} color="#FFD700" />
                  </TouchableOpacity>
                </View>
              </View>
              
              {/* Search Input - Fixed below header */}
              <View style={styles.searchContainer}>
                <Ionicons 
                  name="search-outline" 
                  size={20} 
                  color="#666" 
                  style={styles.searchIcon} 
                />
                <TextInput
                  ref={searchInputRef}
                  style={styles.searchInput}
                  placeholder="Search country by name, code, or dial code..."
                  placeholderTextColor="#666"
                  value={searchTerm}
                  onChangeText={setSearchTerm}
                  returnKeyType="search"
                  clearButtonMode="while-editing"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                {searchTerm ? (
                  <TouchableOpacity 
                    onPress={clearSearch}
                    style={styles.clearButton}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <Ionicons name="close-circle" size={20} color="#666" />
                  </TouchableOpacity>
                ) : null}
              </View>
              
              {/* Scrollable Country List - Takes remaining space */}
              <View style={styles.listContainer}>
                <FlatList
                  data={filteredCountries}
                  keyExtractor={(item) => `${item.iso}-${item.bpay_iso}`}
                  renderItem={renderCountryItem}
                  initialNumToRender={20}
                  maxToRenderPerBatch={30}
                  windowSize={10}
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={true}
                  indicatorStyle="white"
                  contentContainerStyle={[
                    styles.listContent,
                    { paddingBottom: isKeyboardVisible ? 50 : 20 }
                  ]}
                  ListEmptyComponent={ListEmptyComponent}
                />
              </View>
            </SafeAreaView>
          </Animated.View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
  },
  keyboardDismissArea: {
    flex: 1,
  },
  keyboardAvoidingView: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  modalContainer: {
    backgroundColor: '#000',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    borderColor: '#333',
    borderBottomWidth: 0,
    overflow: 'hidden',
    // Fixed height, KeyboardAvoidingView will handle the push
  },
  safeArea: {
    flex: 1,
  },
  header: {
    backgroundColor: '#000',
    paddingHorizontal: 0,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  headerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  title: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    flex: 1,
  },
  closeButton: {
    padding: 4,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#111',
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  searchIcon: {
    marginRight: 12,
  },
  searchInput: {
    flex: 1,
    color: '#fff',
    fontSize: 16,
    paddingVertical: 8,
    paddingRight: 8,
  },
  clearButton: {
    padding: 4,
    marginLeft: 4,
  },
  listContainer: {
    flex: 1,
  },
  listContent: {
    paddingBottom: 20,
  },
  countryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
  },
  countryItemSelected: {
    backgroundColor: 'rgba(255, 215, 0, 0.05)',
  },
  countryFlag: {
    fontSize: 28,
    marginRight: 16,
    width: 40,
  },
  countryInfo: {
    flex: 1,
  },
  countryName: {
    color: '#fff',
    fontSize: 16,
    marginBottom: 4,
    fontWeight: '500',
  },
  countryDetails: {
    color: '#999',
    fontSize: 13,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
    paddingVertical: 60,
  },
  emptyText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtext: {
    color: '#666',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
});

export default CountryPickerModal;