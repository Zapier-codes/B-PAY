import React, { useRef, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  Animated,
  Image,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import { supabase } from '@/config/supabase';
import { useAuth } from '@/stores/auth-store';

const { width } = Dimensions.get('window');

// Your correct live public key
// Security fix (Task 67, mavins-web handover.md): this used to be
// `{ baseUrl: 'https://api.payscribe.ng/api/v1', apiKey: 'Bearer
// ps_pk_live_...' }` — a LIVE secret key hardcoded directly in
// source, in a public repo, also bundled into the compiled mobile
// app. The transfer call itself now goes through a new server-side
// Edge Function (supabase/functions/payscribe-transfer/index.ts),
// which is the only place that secret lives now, read from an
// environment variable. This client no longer needs or has the key
// at all.

interface SuccessParams {
  amount: string;
  recipientTag?: string;
  recipientId?: string;
  accountName?: string;
  accountNumber?: string;
  bankCode?: string;
  bankName?: string;
  remark?: string;
  note?: string;
  selectedPaymentMethod?: string;
  authMethod?: 'pin' | 'biometric';
  pin?: string;
  userId?: string;
  status?: 'processing' | 'success' | 'failed';
  processingMessage?: string;
  errorMessage?: string;
  isFirstTime?: string;
  bonusAmount?: string;
  transactionType?: 'bank_transfer' | 'bpay';
}

export default function SendSuccessScreen() {
  const params = useLocalSearchParams<SuccessParams>();
  const navigation = useNavigation();
  const { user } = useAuth();

  const amount = parseFloat(params.amount || '0');
  const recipientTag = params.recipientTag || params.accountName || '';
  const recipientId = params.recipientId || '';
  const accountNumber = params.accountNumber || '';
  const bankCode = params.bankCode || '';
  const bankName = params.bankName || '';
  const note = params.remark || params.note || '';
  const selectedPaymentMethod = params.selectedPaymentMethod || 'balance';
  const authMethod = params.authMethod || 'pin';
  const userId = params.userId || user?.id || '';
  const bonusAmount = parseFloat(params.bonusAmount || '0');
  const isFirstTime = params.isFirstTime === 'true';
  const transactionType = params.transactionType || (accountNumber ? 'bank_transfer' : 'bpay');

  const [transactionStatus, setTransactionStatus] = useState<'processing' | 'success' | 'failed'>('processing');
  const [processingMessage, setProcessingMessage] = useState(params.processingMessage || 'Initializing transaction...');
  const [errorMessage, setErrorMessage] = useState(params.errorMessage || '');
  const [transactionId, setTransactionId] = useState('');
  const [payscribeResponse, setPayscribeResponse] = useState<any>(null);

  // Animation refs
  const watermarkPulse = useRef(new Animated.Value(1)).current;
  const fadeIn = useRef(new Animated.Value(0)).current;
  const slideUp = useRef(new Animated.Value(30)).current;
  const iconScale = useRef(new Animated.Value(0)).current;
  const detailsFade = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(1)).current;
  const spinValue = useRef(new Animated.Value(0)).current;
  const processingDotPulse = useRef(new Animated.Value(1)).current;

  const spin = spinValue.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const dotPulse = processingDotPulse.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1.3] });

  const generateTransactionId = () => {
    const timestamp = Date.now().toString();
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    const baseId = (timestamp + random).slice(0, 12);
    const alphanumeric = baseId.replace(/[^a-zA-Z0-9]/g, '');
    return `Bpay${alphanumeric}`.slice(0, 16);
  };

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(watermarkPulse, { toValue: 1.06, duration: 3000, useNativeDriver: true }),
        Animated.timing(watermarkPulse, { toValue: 1, duration: 3000, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  useEffect(() => {
    if (transactionStatus === 'processing') {
      Animated.loop(
        Animated.sequence([
          Animated.timing(processingDotPulse, { toValue: 1.3, duration: 800, useNativeDriver: true }),
          Animated.timing(processingDotPulse, { toValue: 0.7, duration: 800, useNativeDriver: true }),
        ])
      ).start();
    }
  }, [transactionStatus]);

  const processTransaction = async () => {
    try {
      const txId = generateTransactionId();
      setTransactionId(txId);

      if (transactionType === 'bank_transfer') {
        await processBankTransfer(txId);
      } else {
        await processBPayTransfer(txId);
      }
    } catch (error: any) {
      console.error('Transaction processing error:', error);
      setTransactionStatus('failed');
      setErrorMessage(error.message || 'Transaction failed. Please try again.');
    }
  };

  const processBankTransfer = async (txId: string) => {
    setProcessingMessage('Validating transaction details...');
    if (!accountNumber || !bankCode || !amount) throw new Error('Missing required transaction details');

    const userBalance = await getUserBalance(userId);
    if (userBalance < amount) throw new Error('Insufficient balance');

    setProcessingMessage('Calculating fees...');
    const feeResponse = await getTransactionFee(amount);
    const fee = feeResponse?.fee || 10;
    const totalAmount = amount + fee;

    if (userBalance < totalAmount) {
      throw new Error(`Insufficient balance. Amount: ₦${amount}, Fee: ₦${fee}, Total: ₦${totalAmount}`);
    }

    setProcessingMessage('Creating transaction record...');
    const transactionData = {
      transaction_id: txId,
      sender_id: userId,
      recipient_name: recipientTag || 'Unknown',
      recipient_account: accountNumber,
      recipient_bank: bankName || 'Unknown',
      bank_code: bankCode,
      amount: amount,
      fee: fee,
      total_amount: totalAmount,
      note: note || '',
      currency: 'NGN',
      status: 'processing',
      transaction_type: 'bank_transfer',
      payment_method: selectedPaymentMethod,
      auth_method: authMethod,
      is_first_time: false,
      is_free_tx: false,
      created_at: new Date().toISOString(),
    };
    await createTransactionRecord(transactionData);

    setProcessingMessage('Preparing transfer...');
    await updateUserBalance(userId, -totalAmount);

    setProcessingMessage('Executing transfer...');
    const transferResult = await executePayscribeTransfer(amount, bankCode, accountNumber, note || 'Transfer from BPay', txId);
    setPayscribeResponse(transferResult);

    if (!transferResult.success) {
      await updateUserBalance(userId, totalAmount);
      await updateTransactionStatus(txId, 'failed', transferResult.message);
      throw new Error(transferResult.message || 'Transfer failed');
    }

    setProcessingMessage('Finalizing transaction...');
    await updateTransactionStatus(txId, 'success');
    await addToBeneficiaries(userId, accountNumber, recipientTag, 'bank');

    setTransactionStatus('success');
    setProcessingMessage('Transfer completed successfully');
  };

  const processBPayTransfer = async (txId: string) => {
    setProcessingMessage('Validating recipient...');
    if (!recipientId || !amount || !userId) throw new Error('Missing required transaction details');
    if (recipientId === userId) throw new Error('Cannot send money to yourself');

    const { data: recipientProfile } = await supabase.from('profiles').select('id, bpay_tag').eq('id', recipientId).single();
    if (!recipientProfile) throw new Error('Recipient not found');

    const userBalance = await getUserBalance(userId);
    if (userBalance < amount) throw new Error('Insufficient balance');

    setProcessingMessage('Creating transaction record...');
    const transactionData = {
      transaction_id: txId,
      sender_id: userId,
      recipient_id: recipientId,
      recipient_name: recipientTag,
      amount: amount,
      bonus_amount: bonusAmount,
      total_amount: amount + bonusAmount,
      note: note,
      currency: 'NGN',
      status: 'processing',
      transaction_type: 'bpay_send',
      payment_method: 'balance',
      auth_method: authMethod,
      is_first_time: isFirstTime,
      is_free_tx: false,
      created_at: new Date().toISOString(),
    };
    await createTransactionRecord(transactionData);

    setProcessingMessage('Processing transfer...');
    await updateUserBalance(userId, -amount);

    const recipientAmount = amount + (isFirstTime ? bonusAmount : 0);
    await updateUserBalance(recipientId, recipientAmount);

    await updateTransactionStatus(txId, 'success');
    await addToBeneficiaries(userId, recipientId, recipientTag, 'bpay');

    setTransactionStatus('success');
    setProcessingMessage('Transfer completed successfully');

    if (isFirstTime && bonusAmount > 0) {
      setTimeout(() => {
        Alert.alert('🎉 First-Time Bonus!', `You received ₦${bonusAmount.toLocaleString()} bonus for your first transaction with this user.`);
      }, 1000);
    }
  };

  const createTransactionRecord = async (data: any) => {
    try {
      const { error } = await supabase.from('transactions').insert(data);
      if (error) {
        console.error('Transaction insert error:', error);
        throw new Error('Failed to create transaction record: ' + error.message);
      }
      console.log('✅ Transaction record created successfully');
    } catch (error: any) {
      console.error('Transaction creation error:', error);
      throw error;
    }
  };

  const updateTransactionStatus = async (txId: string, status: string, errorMsg?: string) => {
    try {
      const { error } = await supabase
        .from('transactions')
        .update({
          status,
          error_message: errorMsg,
          completed_at: status === 'success' || status === 'failed' ? new Date().toISOString() : null,
          updated_at: new Date().toISOString(),
        })
        .eq('transaction_id', txId);
      if (error) console.error('Transaction update error:', error);
      else console.log('✅ Transaction status updated');
    } catch (error) {
      console.error('Error updating transaction status:', error);
    }
  };

  const getTransactionFee = async (amount: number) => {
    try {
      if (amount <= 5000) return { fee: 10 };
      if (amount <= 50000) return { fee: 25 };
      if (amount <= 200000) return { fee: 50 };
      return { fee: 100 };
    } catch (error) {
      console.error('Fee calculation error:', error);
      return { fee: 25 };
    }
  };

  const executePayscribeTransfer = async (amount: number, bank: string, account: string, narration: string, ref: string) => {
    try {
      const requestBody = {
        amount: amount.toString(),
        bank: bank.trim(),
        account: account.trim(),
        currency: 'ngn',
        narration: narration || 'Transfer from BPay',
        ref,
      };
      console.log('Payscribe transfer request:', requestBody);

      // Security fix (Task 67): was a direct fetch() to Payscribe with
      // the secret key attached client-side (see this function's own
      // PAYSCRIBE_CONFIG comment above for why that's gone). Now calls
      // the new server-side proxy Edge Function instead — same request
      // body shape, same response shape passed through unchanged, so
      // everything below this call is unmodified.
      const { data, error: invokeError } = await supabase.functions.invoke(
        'payscribe-transfer',
        { body: requestBody }
      );

      if (invokeError) {
        console.error('Payscribe transfer invoke error:', invokeError);
        return { success: false, message: 'Network error. Please check your connection and try again.' };
      }

      console.log('Payscribe transfer response:', data);

      if (data.status === true) {
        return {
          success: true,
          trans_id: data.message?.details?.trans_id,
          ref: data.message?.details?.ref,
          ...data.message?.details,
        };
      } else {
        let errorMessage = data.description || 'Transfer failed';

        // Special handling for the exact error you got in Thunder Client
        if (data.description === 'Business is not in active state.') {
          errorMessage = 'Bank transfers are not yet activated on your Payscribe account.\n\nPlease contact Payscribe support to activate live payouts.\n\nOnce activated, transfers will work instantly.';
        } else if (data.status_code === 401) {
          errorMessage = 'Invalid API key or account not authorized. Check your Payscribe dashboard.';
        } else if (data.status_code === 406) {
          errorMessage = 'IP not whitelisted. Contact Payscribe support.';
        } else if (data.status_code === 410) {
          errorMessage = 'Insufficient funds in your Payscribe wallet.';
        }

        return { success: false, message: errorMessage, status_code: data.status_code };
      }
    } catch (error: any) {
      return { success: false, message: 'Network error. Please check your connection and try again.' };
    }
  };

  const getUserBalance = async (userId: string) => {
    try {
      const { data, error } = await supabase.from('profiles').select('balance').eq('id', userId).single();
      if (error) {
        console.error('Balance fetch error:', error);
        return 0;
      }
      return data?.balance || 0;
    } catch (error) {
      console.error('Error getting balance:', error);
      return 0;
    }
  };

  const updateUserBalance = async (userId: string, amount: number) => {
    try {
      const { data: profile } = await supabase.from('profiles').select('balance').eq('id', userId).single();
      if (!profile) throw new Error('Profile not found');
      const newBalance = Math.max(0, profile.balance + amount);
      const { error } = await supabase
        .from('profiles')
        .update({ balance: newBalance, updated_at: new Date().toISOString() })
        .eq('id', userId);
      if (error) throw error;
      console.log(`Updated balance for ${userId}: ${profile.balance} → ${newBalance}`);
    } catch (error) {
      console.error('Error updating balance:', error);
      throw error;
    }
  };

  const addToBeneficiaries = async (userId: string, beneficiaryId: string, beneficiaryName: string, type: 'bank' | 'bpay') => {
    try {
      const { data: existing } = await supabase.from('beneficiaries').select('*').eq('user_id', userId).eq('beneficiary_id', beneficiaryId).maybeSingle();
      if (!existing) {
        await supabase.from('beneficiaries').insert({
          user_id: userId,
          beneficiary_id: beneficiaryId,
          beneficiary_name: beneficiaryName || 'Unknown',
          beneficiary_type: type,
          last_sent_at: new Date().toISOString(),
          transaction_count: 1,
          created_at: new Date().toISOString(),
        });
      } else {
        await supabase
          .from('beneficiaries')
          .update({
            last_sent_at: new Date().toISOString(),
            transaction_count: (existing.transaction_count || 0) + 1,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existing.id);
      }
    } catch (error) {
      console.error('Error adding beneficiary:', error);
    }
  };

  const handleShareReceipt = () => {
    const receiptText = `
🎉 Payment Successful!

Amount: ₦${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
Recipient: ${recipientTag || 'Unknown'}
${transactionType === 'bank_transfer' ? `Account: ${accountNumber}\nBank: ${bankName}` : 'BPay Transfer'}
${note ? `Note: ${note}` : ''}
Date: ${new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
Transaction ID: ${transactionId}

Powered by BPay 💛
    `.trim();

    Alert.alert('Share Receipt', receiptText, [
      { text: 'Copy', onPress: () => Alert.alert('Copied!', 'Receipt copied to clipboard') },
      { text: 'OK' },
    ]);
  };

  const handleDone = () => router.replace('/(app)/(protected)');
  const handleSendAgain = () => router.replace(transactionType === 'bank_transfer' ? '/(app)/send' : '/(app)/send/bpay');
  const handleRetry = async () => {
    setTransactionStatus('processing');
    setProcessingMessage('Retrying transaction...');
    await processTransaction();
  };
  const handleContactSupport = () => {
    Alert.alert(
      'Contact Support',
      `Transaction ID: ${transactionId}\nAmount: ₦${amount.toLocaleString()}\nType: ${transactionType === 'bank_transfer' ? 'Bank Transfer' : 'BPay Transfer'}\n\nEmail: support@bpayscribe.com`,
      [{ text: 'OK' }]
    );
  };

  const displayTransactionId = transactionId || 'Bpay' + Date.now().toString().slice(-8);
  const truncatedId = displayTransactionId.length > 16 ? displayTransactionId.slice(0, 13) + '...' : displayTransactionId;

  useEffect(() => {
    navigation.setOptions({ gestureEnabled: false, headerShown: false });

    Animated.parallel([
      Animated.timing(fadeIn, { toValue: 1, duration: 800, useNativeDriver: true }),
      Animated.spring(slideUp, { toValue: 0, useNativeDriver: true, tension: 40, friction: 8, delay: 100 }),
      Animated.timing(detailsFade, { toValue: 1, duration: 600, delay: 200, useNativeDriver: true }),
    ]).start();

    Animated.loop(Animated.timing(spinValue, { toValue: 1, duration: 1500, useNativeDriver: true })).start();

    const process = async () => {
      try {
        await processTransaction();
      } catch (error: any) {
        setTransactionStatus('failed');
        setErrorMessage(error.message || 'Transaction failed');
      }
    };
    process();
  }, []);

  useEffect(() => {
    if (transactionStatus === 'success') {
      Animated.sequence([
        Animated.spring(iconScale, { toValue: 1.1, useNativeDriver: true, tension: 50, friction: 3 }),
        Animated.spring(iconScale, { toValue: 1, useNativeDriver: true, tension: 100, friction: 5 }),
      ]).start();

      Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, { toValue: 1.15, duration: 1500, useNativeDriver: true }),
          Animated.timing(pulse, { toValue: 1, duration: 1500, useNativeDriver: true }),
        ])
      ).start();
    }
  }, [transactionStatus]);

  return (
    <View style={styles.container}>
      <Animated.View pointerEvents="none" style={styles.watermarkWrapper}>
        <Animated.Image source={require('@/assets/icons/home.png')} style={[styles.watermark, { transform: [{ scale: watermarkPulse }] }]} resizeMode="contain" />
      </Animated.View>
      <View style={styles.bgCircle1} />
      <View style={styles.bgCircle2} />

      <Animated.View style={[styles.content, { opacity: fadeIn, transform: [{ translateY: slideUp }] }]}>
        <View style={styles.iconContainer}>
          {transactionStatus === 'processing' ? (
            <Animated.View style={[styles.processingSpinnerContainer, { transform: [{ rotate: spin }] }]}>
              <View style={styles.spinnerOuterRing}>
                <View style={styles.spinnerMiddleRing}>
                  <View style={styles.spinnerInnerRing}>
                    <ActivityIndicator size="large" color="#4CAF50" />
                  </View>
                </View>
              </View>
            </Animated.View>
          ) : transactionStatus === 'success' ? (
            <Animated.View style={[styles.iconContainer, { transform: [{ scale: iconScale }] }]}>
              <View style={styles.iconGlow} />
              <Image source={require('@/assets/images/home-3.png')} style={styles.logoIcon} resizeMode="contain" />
              <Animated.View style={[styles.checkmarkBadge, { transform: [{ scale: pulse }] }]}>
                <Ionicons name="checkmark" size={18} color="#000" />
              </Animated.View>
            </Animated.View>
          ) : (
            <View style={styles.failedIconContainer}>
              <Ionicons name="close-circle" size={70} color="#EF4444" />
            </View>
          )}
        </View>

        <View style={styles.statusMessageContainer}>
          <Text style={[styles.successTitle, transactionStatus === 'failed' && styles.failedText]}>
            {transactionStatus === 'processing' ? 'Processing Payment...' : transactionStatus === 'success' ? 'Payment Successful!' : 'Payment Failed'}
          </Text>
          <Text style={[styles.successSubtitle, transactionStatus === 'failed' && styles.failedText]}>
            {transactionStatus === 'processing' ? processingMessage : transactionStatus === 'success' ? 'Your transaction has been processed securely' : errorMessage || 'Transaction could not be completed'}
          </Text>
        </View>

        <Animated.View style={[styles.amountCard, transactionStatus === 'processing' && styles.processingCard, transactionStatus === 'failed' && styles.failedCard, { opacity: detailsFade }]}>
          <View style={[styles.amountGlow, transactionStatus === 'processing' && styles.processingAmountGlow, transactionStatus === 'failed' && styles.failedAmountGlow]} />
          <Text style={styles.amountLabel}>{transactionStatus === 'processing' ? 'Processing Amount' : 'Amount Sent'}</Text>
          <Text style={styles.amount}>₦{amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Text>
        </Animated.View>

        <Animated.View style={[styles.detailsCard, { opacity: detailsFade }, transactionStatus === 'processing' && styles.processingCard, transactionStatus === 'failed' && styles.failedCard]}>
          <View style={[styles.cardBorder, transactionStatus === 'processing' && styles.processingCardBorder, transactionStatus === 'failed' && styles.failedCardBorder]} />

          <View style={styles.detailRow}>
            <View style={styles.labelRow}>
              <Ionicons name={transactionType === 'bank_transfer' ? 'swap-horizontal' : 'at-circle'} size={14} color="#FFD700" />
              <Text style={styles.label}>Type</Text>
            </View>
            <Text style={styles.value}>{transactionType === 'bank_transfer' ? 'Bank Transfer' : 'BPay Transfer'}</Text>
          </View>
          <View style={styles.dividerLine} />

          {recipientTag && (
            <>
              <View style={styles.detailRow}>
                <View style={styles.labelRow}>
                  <Ionicons name="person-outline" size={14} color="#FFD700" />
                  <Text style={styles.label}>Recipient</Text>
                </View>
                <Text style={styles.value}>{recipientTag}</Text>
              </View>
              <View style={styles.dividerLine} />
            </>
          )}

          {transactionType === 'bank_transfer' && accountNumber && (
            <>
              <View style={styles.detailRow}>
                <View style={styles.labelRow}>
                  <Ionicons name="card-outline" size={14} color="#FFD700" />
                  <Text style={styles.label}>Account</Text>
                </View>
                <Text style={styles.accountNumber}>{accountNumber}</Text>
              </View>
              <View style={styles.dividerLine} />
            </>
          )}

          {transactionType === 'bank_transfer' && bankName && (
            <>
              <View style={styles.detailRow}>
                <View style={styles.labelRow}>
                  <Ionicons name="business-outline" size={14} color="#FFD700" />
                  <Text style={styles.label}>Bank</Text>
                </View>
                <Text style={styles.value}>{bankName}</Text>
              </View>
              <View style={styles.dividerLine} />
            </>
          )}

          {transactionType === 'bpay' && isFirstTime && bonusAmount > 0 && (
            <>
              <View style={styles.detailRow}>
                <View style={styles.labelRow}>
                  <Ionicons name="gift-outline" size={14} color="#4CAF50" />
                  <Text style={styles.label}>First-Time Bonus</Text>
                </View>
                <Text style={styles.bonusText}>+₦{bonusAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Text>
              </View>
              <View style={styles.dividerLine} />
            </>
          )}

          {note && (
            <>
              <View style={styles.detailRow}>
                <View style={styles.labelRow}>
                  <Ionicons name="chatbox-outline" size={14} color="#FFD700" />
                  <Text style={styles.label}>Note</Text>
                </View>
                <Text style={styles.noteText}>{note}</Text>
              </View>
              <View style={styles.dividerLine} />
            </>
          )}

          <View style={styles.detailRow}>
            <View style={styles.labelRow}>
              <Ionicons name="shield-checkmark-outline" size={14} color="#4CAF50" />
              <Text style={styles.label}>Status</Text>
            </View>
            <View style={[styles.statusBadge, transactionStatus === 'processing' && styles.processingStatusBadge, transactionStatus === 'failed' && styles.failedStatusBadge]}>
              {transactionStatus === 'processing' ? (
                <Animated.View style={{ transform: [{ scale: dotPulse }] }}>
                  <View style={styles.processingStatusDot} />
                </Animated.View>
              ) : (
                <View style={[styles.statusDot, transactionStatus === 'failed' && styles.failedStatusDot]} />
              )}
              <Text style={[styles.statusText, transactionStatus === 'failed' && styles.failedStatusText]}>
                {transactionStatus === 'processing' ? 'Processing...' : transactionStatus === 'success' ? 'Verified' : 'Failed'}
              </Text>
            </View>
          </View>
          <View style={styles.dividerLine} />

          <View style={styles.detailRow}>
            <View style={styles.labelRow}>
              <Ionicons name="time-outline" size={14} color="#FFD700" />
              <Text style={styles.label}>Date</Text>
            </View>
            <Text style={styles.value}>
              {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </Text>
          </View>
          <View style={styles.dividerLine} />

          <View style={styles.detailRow}>
            <View style={styles.labelRow}>
              <Ionicons name="receipt-outline" size={14} color="#FFD700" />
              <Text style={styles.label}>Transaction ID</Text>
            </View>
            <Text style={styles.transactionIdText} numberOfLines={1}>{truncatedId}</Text>
          </View>

          {transactionType === 'bank_transfer' && payscribeResponse?.trans_id && (
            <>
              <View style={styles.dividerLine} />
              <View style={styles.detailRow}>
                <View style={styles.labelRow}>
                  <Ionicons name="finger-print-outline" size={14} color="#FFD700" />
                  <Text style={styles.label}>Provider ID</Text>
                </View>
                <Text style={styles.providerIdText} numberOfLines={1}>{payscribeResponse.trans_id}</Text>
              </View>
            </>
          )}
        </Animated.View>

        <Animated.View style={[styles.buttonContainer, { opacity: detailsFade }]}>
          {transactionStatus === 'processing' ? (
            <TouchableOpacity style={[styles.actionButton, styles.cancelButton]} onPress={() => Alert.alert('Cancel Transaction', 'Are you sure?', [{ text: 'No' }, { text: 'Yes', onPress: () => router.replace('/(app)/(protected)') }])}>
              <Ionicons name="close" size={18} color="#EF4444" />
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
          ) : transactionStatus === 'success' ? (
            <>
              <TouchableOpacity style={styles.iconButton} onPress={handleDone} activeOpacity={0.7}>
                <View style={styles.buttonIconCircle}><Ionicons name="home-outline" size={24} color="#FFD700" /></View>
                <Text style={styles.buttonLabel}>Home</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.iconButton} onPress={handleSendAgain} activeOpacity={0.7}>
                <View style={styles.buttonIconCircle}><Ionicons name="repeat-outline" size={24} color="#FFD700" /></View>
                <Text style={styles.buttonLabel}>Send Again</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.iconButton} onPress={handleShareReceipt} activeOpacity={0.7}>
                <View style={styles.buttonIconCircle}><Ionicons name="share-social-outline" size={24} color="#FFD700" /></View>
                <Text style={styles.buttonLabel}>Share Receipt</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <TouchableOpacity style={[styles.actionButton, styles.retryButton]} onPress={handleRetry} activeOpacity={0.7}>
                <Ionicons name="refresh" size={18} color="#FFD700" />
                <Text style={styles.retryButtonText}>Retry</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.actionButton, styles.homeButton]} onPress={handleDone} activeOpacity={0.7}>
                <Ionicons name="home" size={18} color="#fff" />
                <Text style={styles.homeButtonText}>Home</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.actionButton, styles.supportButton]} onPress={handleContactSupport} activeOpacity={0.7}>
                <Ionicons name="help-circle" size={18} color="#FFD700" />
                <Text style={styles.supportButtonText}>Support</Text>
              </TouchableOpacity>
            </>
          )}
        </Animated.View>

        <Animated.View style={[styles.securityFooter, { opacity: detailsFade }]}>
          <View style={styles.securityBadge}><Ionicons name="lock-closed" size={14} color="#4CAF50" /><Text style={styles.securityText}>AES-256</Text></View>
          <View style={styles.securityDivider} />
          <View style={styles.securityBadge}><Ionicons name="shield-checkmark" size={14} color="#4CAF50" /><Text style={styles.securityText}>SSL</Text></View>
          <View style={styles.securityDivider} />
          <View style={styles.securityBadge}><Ionicons name="server" size={14} color="#4CAF50" /><Text style={styles.securityText}>Payscribe</Text></View>
        </Animated.View>

        <View style={styles.environmentBadge}>
          <Ionicons name="flash" size={12} color="#FFD700" />
          <Text style={styles.environmentText}>LIVE ENVIRONMENT</Text>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center', padding: 16 },
  watermarkWrapper: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center', zIndex: 1 },
  watermark: { width: 300, height: 300, opacity: 0.1 },
  bgCircle1: { position: 'absolute', top: -100, right: -100, width: 300, height: 300, borderRadius: 150, backgroundColor: '#FFD700', opacity: 0.03 },
  bgCircle2: { position: 'absolute', bottom: -150, left: -150, width: 400, height: 400, borderRadius: 200, backgroundColor: '#4CAF50', opacity: 0.02 },
  content: { width: '100%', maxWidth: 360, alignItems: 'center', zIndex: 2 },
  iconContainer: { position: 'relative', marginBottom: 8, alignItems: 'center', justifyContent: 'center', height: 110 },
  failedIconContainer: { alignItems: 'center', justifyContent: 'center', height: 80 },
  iconGlow: { position: 'absolute', width: 100, height: 100, borderRadius: 50, backgroundColor: '#FFD700', opacity: 0.15 },
  processingSpinnerContainer: { width: 110, height: 110, alignItems: 'center', justifyContent: 'center' },
  spinnerOuterRing: { width: 90, height: 90, borderRadius: 45, borderWidth: 3, borderColor: 'rgba(76, 175, 80, 0.3)', borderTopColor: '#4CAF50', alignItems: 'center', justifyContent: 'center' },
  spinnerMiddleRing: { width: 70, height: 70, borderRadius: 35, borderWidth: 2, borderColor: 'rgba(76, 175, 80, 0.2)', alignItems: 'center', justifyContent: 'center' },
  spinnerInnerRing: { width: 50, height: 50, borderRadius: 25, borderWidth: 1, borderColor: 'rgba(76, 175, 80, 0.1)', alignItems: 'center', justifyContent: 'center' },
  logoIcon: { width: 110, height: 110 },
  checkmarkBadge: { position: 'absolute', bottom: -4, right: -4, width: 28, height: 28, borderRadius: 14, backgroundColor: '#4CAF50', alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: '#000', shadowColor: '#4CAF50', shadowOpacity: 0.6, shadowRadius: 8, elevation: 8 },
  statusMessageContainer: { alignItems: 'center', marginBottom: 16 },
  successTitle: { fontSize: 22, fontWeight: '700', marginBottom: 6, textAlign: 'center', color: '#fff' },
  successSubtitle: { fontSize: 13, textAlign: 'center', opacity: 0.9, color: '#888' },
  failedText: { color: '#EF4444' },
  amountCard: { width: '100%', backgroundColor: 'rgba(255, 215, 0, 0.1)', borderRadius: 16, padding: 18, alignItems: 'center', marginBottom: 18, borderWidth: 1.5, borderColor: 'rgba(255, 215, 0, 0.3)', position: 'relative', minHeight: 120 },
  processingCard: { backgroundColor: 'rgba(17, 17, 17, 0.9)', borderColor: 'rgba(76, 175, 80, 0.4)' },
  failedCard: { backgroundColor: 'rgba(239, 68, 68, 0.08)', borderColor: 'rgba(239, 68, 68, 0.4)', width: '85%', padding: 16, minHeight: 110 },
  amountGlow: { position: 'absolute', top: 0, left: 0, right: 0, height: 2, backgroundColor: '#FFD700', opacity: 0.5 },
  processingAmountGlow: { backgroundColor: '#4CAF50', opacity: 0.8 },
  failedAmountGlow: { backgroundColor: '#EF4444', opacity: 0.8 },
  amountLabel: { fontSize: 12, marginBottom: 8, fontWeight: '600', letterSpacing: 1, color: '#FFD700' },
  amount: { fontSize: 36, fontWeight: '300', letterSpacing: -1, color: '#FFFFFF' },
  detailsCard: { width: '100%', backgroundColor: 'transparent', borderRadius: 16, padding: 18, marginBottom: 18, borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.1)' },
  cardBorder: { position: 'absolute', top: 0, left: 0, right: 0, height: 1, backgroundColor: 'rgba(255, 215, 0, 0.3)' },
  processingCardBorder: { backgroundColor: 'rgba(76, 175, 80, 0.5)' },
  failedCardBorder: { backgroundColor: 'rgba(239, 68, 68, 0.5)' },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 5 },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  label: { color: '#999', fontSize: 13, fontWeight: '500' },
  value: { color: '#fff', fontSize: 13, fontWeight: '600' },
  accountNumber: { color: '#FFD700', fontSize: 13, fontWeight: '600', fontFamily: 'monospace' },
  bonusText: { color: '#4CAF50', fontSize: 13, fontWeight: '600' },
  noteText: { color: '#888', fontSize: 13, fontStyle: 'italic', maxWidth: '50%', textAlign: 'right' },
  transactionIdText: { color: '#FFD700', fontSize: 9, fontWeight: '600', fontFamily: 'monospace', maxWidth: 120, letterSpacing: 0.5 },
  providerIdText: { color: '#4CAF50', fontSize: 8, fontWeight: '500', fontFamily: 'monospace', maxWidth: 100, letterSpacing: 0.3 },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(76, 175, 80, 0.15)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(76, 175, 80, 0.3)' },
  processingStatusBadge: { backgroundColor: 'rgba(76, 175, 80, 0.15)', borderColor: 'rgba(76, 175, 80, 0.3)' },
  failedStatusBadge: { backgroundColor: 'rgba(239, 68, 68, 0.15)', borderColor: 'rgba(239, 68, 68, 0.3)' },
  statusDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#4CAF50' },
  processingStatusDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#4CAF50' },
  failedStatusDot: { backgroundColor: '#EF4444' },
  statusText: { color: '#4CAF50', fontSize: 12, fontWeight: '600' },
  failedStatusText: { color: '#EF4444' },
  dividerLine: { height: 1, backgroundColor: 'rgba(255, 255, 255, 0.08)', marginVertical: 8 },
  buttonContainer: { width: '100%', flexDirection: 'row', justifyContent: 'space-between', gap: 12, marginBottom: 20 },
  iconButton: { flex: 1, alignItems: 'center', gap: 8 },
  actionButton: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12, paddingHorizontal: 16, borderRadius: 12, backgroundColor: 'rgba(17, 17, 17, 0.9)', borderWidth: 1.5 },
  cancelButton: { borderColor: 'rgba(239, 68, 68, 0.4)' },
  retryButton: { borderColor: 'rgba(255, 215, 0, 0.4)' },
  homeButton: { borderColor: 'rgba(255, 255, 255, 0.2)', backgroundColor: 'rgba(255, 255, 255, 0.1)' },
  supportButton: { borderColor: 'rgba(255, 215, 0, 0.4)' },
  buttonIconCircle: { width: 50, height: 50, borderRadius: 25, backgroundColor: 'rgba(17, 17, 17, 0.9)', borderWidth: 1.5, borderColor: 'rgba(255, 215, 0, 0.3)', alignItems: 'center', justifyContent: 'center' },
  buttonLabel: { color: '#aaa', fontSize: 11, fontWeight: '500' },
  cancelButtonText: { color: '#EF4444', fontSize: 12, fontWeight: '600' },
  retryButtonText: { color: '#FFD700', fontSize: 12, fontWeight: '600' },
  homeButtonText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  supportButtonText: { color: '#FFD700', fontSize: 12, fontWeight: '600' },
  securityFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: 'rgba(76, 175, 80, 0.1)', borderRadius: 18, borderWidth: 1, borderColor: 'rgba(76, 175, 80, 0.2)', marginBottom: 10 },
  securityBadge: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  securityDivider: { width: 1, height: 12, backgroundColor: 'rgba(76, 175, 80, 0.3)' },
  securityText: { color: '#4CAF50', fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  environmentBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: 'rgba(255, 215, 0, 0.1)', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255, 215, 0, 0.3)' },
  environmentText: { color: '#FFD700', fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
});