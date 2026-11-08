import { createClient } from "npm:@supabase/supabase-js@2";
import {
  createProductImageUploadHandler,
  type ProductImageUploadDependencies,
} from "../_shared/product-image-upload-handler.ts";

type Runtime = {
  env: { get(name: string): string | undefined };
  serve(handler: (request: Request) => Response | Promise<Response>): void;
};

type SupabaseClient = ReturnType<typeof createClient>;
type ProductImageAdminClient = ReturnType<ProductImageUploadDependencies["createAdminClient"]>;
type ProductImageAuthClient = ReturnType<ProductImageUploadDependencies["createAuthClient"]>;

const runtime = (globalThis as unknown as { Deno?: Runtime }).Deno;
if (!runtime) throw new Error("Supabase Edge Runtime required.");

function getRuntimeEnv(name: string): string | undefined {
  return runtime.env.get(name);
}

function createProductImageAuthClient(url: string, anonKey: string): ProductImageAuthClient {
  const auth = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return {
    auth: { getUser: (token) => auth.auth.getUser(token) },
    setProductImageUrl: async (token, productId, expectedImageUrl, nextImageUrl) => {
      const command = createClient(url, anonKey, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
        global: { headers: { Authorization: "Bearer " + token } },
      });
      const { data, error } = await command.rpc("set_staff_product_image", {
        p_product_id: productId, p_expected_image_url: expectedImageUrl, p_image_url: nextImageUrl,
      });
      return { data, error };
    },
    addProductGalleryImage: async (token, productId, imageUrl) => {
      const command = createClient(url, anonKey, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
        global: { headers: { Authorization: "Bearer " + token } },
      });
      const { data, error } = await command.rpc("mutate_staff_product_gallery_image", {
        p_product_id: productId, p_image_url: imageUrl, p_action: "add",
      });
      return { data, error };
    },
  };
}

function lookupProfile(admin: SupabaseClient): ProductImageAdminClient["getProfileByAuthUserId"] {
  return async (authUserId) => {
    const { data, error } = await admin.from("profiles")
      .select("id,organization_id,is_active")
      .eq("auth_user_id", authUserId)
      .maybeSingle();
    return { data, error };
  };
}

function lookupRoles(admin: SupabaseClient): ProductImageAdminClient["getRoles"] {
  return async (profileId) => {
    const { data, error } = await admin.from("user_roles").select("role").eq("profile_id", profileId);
    return { data, error };
  };
}

function lookupProduct(admin: SupabaseClient): ProductImageAdminClient["productExists"] {
  return async (productId, organizationId) => {
    const { data, error } = await admin.from("products")
      .select("id")
      .eq("id", productId)
      .eq("organization_id", organizationId)
      .maybeSingle();
    return { data, error };
  };
}

function uploadProductImage(admin: SupabaseClient): ProductImageAdminClient["storage"]["upload"] {
  return async (objectPath, bytes, options) => {
    const { error } = await admin.storage.from("product-images").upload(objectPath, bytes, options);
    return { error };
  };
}

function removeProductImages(admin: SupabaseClient): ProductImageAdminClient["storage"]["remove"] {
  return async (paths) => {
    const { error } = await admin.storage.from("product-images").remove(paths);
    return { error };
  };
}

function getProductImagePublicUrl(admin: SupabaseClient): ProductImageAdminClient["storage"]["getPublicUrl"] {
  return (objectPath) => admin.storage.from("product-images").getPublicUrl(objectPath);
}

function createProductImageStorage(admin: SupabaseClient): ProductImageAdminClient["storage"] {
  return {
    upload: uploadProductImage(admin),
    remove: removeProductImages(admin),
    getPublicUrl: getProductImagePublicUrl(admin),
  };
}

function createProductImageAdminClient(url: string, serviceKey: string): ProductImageAdminClient {
  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return {
    getProfileByAuthUserId: lookupProfile(admin),
    getRoles: lookupRoles(admin),
    productExists: lookupProduct(admin),
    storage: createProductImageStorage(admin),
  };
}

runtime.serve(createProductImageUploadHandler({
  getEnv: getRuntimeEnv,
  createAuthClient: createProductImageAuthClient,
  createAdminClient: createProductImageAdminClient,
}));
