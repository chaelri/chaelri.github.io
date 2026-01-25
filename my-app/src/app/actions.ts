"use server"
import { prisma } from "../lib/db";
import { revalidatePath } from "next/cache";

export async function addUser(formData: FormData) {
  const name = formData.get("name") as string;
  const email = formData.get("email") as string;

  if (!name || !email) return;

  try {
    await prisma.user.create({
      data: { name, email },
    });
    
    revalidatePath("/"); 
  } catch (error) {
    // We just log it here on the server (terminal) 
    // instead of returning it to the form
    console.error("Failed to add user:", error);
  }
  
  // By not returning anything here, the function returns 'void'
  // and the red underline will disappear.
}

// Add this to the bottom of src/app/actions.ts

export async function deleteUser(id: number) {
  try {
    await prisma.user.delete({
      where: { id: id },
    });
    revalidatePath("/");
  } catch (error) {
    console.error("Delete failed:", error);
  }
}