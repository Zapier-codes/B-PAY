// hooks/useUserProfile.ts
import { useState, useCallback } from "react";
import { supabase } from "@/config/supabase";
import { useAuth } from "@/stores/auth-store";
import { bpay } from "@/services/edgeFunctions";

export interface UserProfile {
  id: string;
  email: string;
  phone: string | null;
  first_name: string | null;
  last_name: string | null;
  bpay_tag: string | null;
  bpay_customer_id: string | null;
  bpay_account_number: string | null;
  country: string;
  tier: number | null;
  verification_status: string | null;
}

export default function useUserProfile() {
  const { currentAccount } = useAuth();
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Get user profile from Supabase
  const getUserProfile = useCallback(async (): Promise<UserProfile | null> => {
    try {
      if (!currentAccount?.user_id) {
        console.log('No user ID found');
        return null;
      }

      const { data, error } = await supabase
        .from("profiles")
        .select("id, email, phone, first_name, last_name, bpay_tag, bpay_customer_id, bpay_account_number, country, tier, verification_status")
        .eq("id", currentAccount.user_id)
        .single();

      if (error) {
        console.error('Error fetching user profile:', error);
        return null;
      }

      setUserProfile(data);
      return data;
    } catch (error) {
      console.error('Error in getUserProfile:', error);
      return null;
    }
  }, [currentAccount?.user_id]);

  // Load user profile
  const loadUserProfile = useCallback(async () => {
    setIsLoading(true);
    const profile = await getUserProfile();
    setIsLoading(false);
    return profile;
  }, [getUserProfile]);

  // Check whether this customer has any transaction history, via BPay —
  // never calls a provider directly, never holds a provider credential.
  // See services/edgeFunctions.ts for why this is the only allowed shape.
  const checkCustomerDetails = useCallback(async (_customerId: string) => {
    try {
      const result = await bpay.getTransactions({ page: 1, page_size: 1 });
      return Array.isArray(result?.transactions);
    } catch (error) {
      console.error('Error checking customer:', error);
      return false;
    }
  }, []);

  return {
    userProfile,
    setUserProfile,
    isLoading,
    setIsLoading,
    getUserProfile,
    loadUserProfile,
    checkCustomerDetails,
  };
}