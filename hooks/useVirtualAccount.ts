// hooks/useVirtualAccount.ts
//
// Rebuilt as part of the full BPay-only migration: this hook used to call
// Payscribe's `/collections/virtual-accounts/create` directly from the
// client, with a hardcoded test secret key bundled into the compiled app.
// It now only calls `bpay.createVirtualAccount(...)` — see
// `services/edgeFunctions.ts` for why no screen/hook is allowed to hold a
// provider URL or credential, ever.
import { useState, useCallback } from "react";
import { Alert } from "react-native";
import { supabase } from "@/config/supabase";
import { useAuth } from "@/stores/auth-store";
import { bpay, BPayError } from "@/services/edgeFunctions";

interface VirtualAccount {
  bankName: string;
  accountNumber: string;
  accountName: string;
  fullAccountNumber: string;
}

export default function useVirtualAccount() {
  const { currentAccount } = useAuth();
  const [ngnAccount, setNgnAccount] = useState<VirtualAccount | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [hasExistingAccount, setHasExistingAccount] = useState(false);

  // Check if virtual account exists in Supabase
  const checkExistingVirtualAccount = useCallback(async () => {
    try {
      if (!currentAccount?.user_id) return false;

      const { data, error } = await supabase
        .from("profiles")
        .select("bpay_account_number, bank_name, first_name, last_name")
        .eq("id", currentAccount.user_id)
        .single();

      if (error) throw error;

      if (data?.bpay_account_number) {
        const fullAccountNumber = data.bpay_account_number;
        setNgnAccount({
          bankName: data.bank_name || "9PSB",
          accountNumber: fullAccountNumber, // NO MASKING - show full number
          accountName: `${data.first_name || ''} ${data.last_name || ''}`.trim(),
          fullAccountNumber: fullAccountNumber
        });
        setHasExistingAccount(true);
        return true;
      }

      setHasExistingAccount(false);
      return false;
    } catch (error) {
      console.error('Error checking virtual account:', error);
      setHasExistingAccount(false);
      return false;
    }
  }, [currentAccount?.user_id]);

  // Create a collection account for this customer via BPay (no provider named or called here)
  const createVirtualAccount = useCallback(async (customerId: string) => {
    try {
      if (!customerId || customerId.trim() === '') {
        throw new Error('Invalid customer ID');
      }

      return await bpay.createVirtualAccount({ customer_id: customerId.trim() });
    } catch (error) {
      console.error("Error creating virtual account:", error);
      const message =
        error instanceof BPayError
          ? error.message
          : "Failed to create your collection account. Please check your connection and try again.";
      Alert.alert("BPay Error", message);
      return null;
    }
  }, []);

  // Update database with virtual account
  const updateDatabaseWithVirtualAccount = useCallback(async (userId: string, accountNumber: string, bankName?: string, accountName?: string) => {
    try {
      const updateData: any = {
        bpay_account_number: accountNumber,
        updated_at: new Date().toISOString(),
      };

      if (bankName) {
        updateData.bank_name = bankName;
      }

      // Note: account_name is not stored separately in your schema
      // It's composed of first_name and last_name

      const { error } = await supabase
        .from("profiles")
        .update(updateData)
        .eq("id", userId);

      if (error) throw error;
      return true;
    } catch (error) {
      console.error('Error updating database:', error);
      return false;
    }
  }, []);

  // Keep maskAccountNumber function but don't use it for display
  const maskAccountNumber = (accountNumber: string): string => {
    if (!accountNumber || accountNumber.length < 10) {
      return "Account number unavailable";
    }

    const firstSix = accountNumber.slice(0, 6);
    const lastFour = accountNumber.slice(-4);
    return `${firstSix}****${lastFour}`;
  };

  return {
    ngnAccount,
    setNgnAccount,
    isGenerating,
    setIsGenerating,
    hasExistingAccount,
    setHasExistingAccount,
    checkExistingVirtualAccount,
    createVirtualAccount,
    updateDatabaseWithVirtualAccount,
    maskAccountNumber,
  };
}
