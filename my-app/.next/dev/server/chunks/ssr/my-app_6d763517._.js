module.exports = [
"[project]/my-app/src/lib/db.ts [app-rsc] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "prisma",
    ()=>prisma
]);
var __TURBOPACK__imported__module__$5b$externals$5d2f40$prisma$2f$client__$5b$external$5d$__$2840$prisma$2f$client$2c$__cjs$2c$__$5b$project$5d2f$my$2d$app$2f$node_modules$2f40$prisma$2f$client$29$__ = __turbopack_context__.i("[externals]/@prisma/client [external] (@prisma/client, cjs, [project]/my-app/node_modules/@prisma/client)");
;
const prismaClientSingleton = ()=>{
    return new __TURBOPACK__imported__module__$5b$externals$5d2f40$prisma$2f$client__$5b$external$5d$__$2840$prisma$2f$client$2c$__cjs$2c$__$5b$project$5d2f$my$2d$app$2f$node_modules$2f40$prisma$2f$client$29$__["PrismaClient"]();
};
const prisma = globalThis.prisma ?? prismaClientSingleton();
if ("TURBOPACK compile-time truthy", 1) globalThis.prisma = prisma;
}),
"[project]/my-app/src/app/actions.ts [app-rsc] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/* __next_internal_action_entry_do_not_use__ [{"40af3c8cda59ee4269c3cba0dadfcce4c8d0d1ab92":"addUser","40f7404565092e062b06cb5fb7cdfa515250fe5dff":"deleteUser","609fe819b94f41fd9521fdcee9985ed3dbf24ebcae":"toggleUserStatus"},"",""] */ __turbopack_context__.s([
    "addUser",
    ()=>addUser,
    "deleteUser",
    ()=>deleteUser,
    "toggleUserStatus",
    ()=>toggleUserStatus
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$my$2d$app$2f$node_modules$2f$next$2f$dist$2f$build$2f$webpack$2f$loaders$2f$next$2d$flight$2d$loader$2f$server$2d$reference$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/my-app/node_modules/next/dist/build/webpack/loaders/next-flight-loader/server-reference.js [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$my$2d$app$2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/my-app/src/lib/db.ts [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$my$2d$app$2f$node_modules$2f$next$2f$cache$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/my-app/node_modules/next/cache.js [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$my$2d$app$2f$node_modules$2f$next$2f$dist$2f$build$2f$webpack$2f$loaders$2f$next$2d$flight$2d$loader$2f$action$2d$validate$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/my-app/node_modules/next/dist/build/webpack/loaders/next-flight-loader/action-validate.js [app-rsc] (ecmascript)");
;
;
;
async function addUser(formData) {
    const name = formData.get("name");
    const email = formData.get("email");
    if (!name || !email) return;
    try {
        await __TURBOPACK__imported__module__$5b$project$5d2f$my$2d$app$2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["prisma"].user.create({
            data: {
                name,
                email
            }
        });
        (0, __TURBOPACK__imported__module__$5b$project$5d2f$my$2d$app$2f$node_modules$2f$next$2f$cache$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["revalidatePath"])("/");
    } catch (error) {
        // We just log it here on the server (terminal) 
        // instead of returning it to the form
        console.error("Failed to add user:", error);
    }
// By not returning anything here, the function returns 'void'
// and the red underline will disappear.
}
async function deleteUser(id) {
    try {
        await __TURBOPACK__imported__module__$5b$project$5d2f$my$2d$app$2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["prisma"].user.delete({
            where: {
                id: id
            }
        });
        (0, __TURBOPACK__imported__module__$5b$project$5d2f$my$2d$app$2f$node_modules$2f$next$2f$cache$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["revalidatePath"])("/");
    } catch (error) {
        console.error("Delete failed:", error);
    }
}
async function toggleUserStatus(id, currentStatus) {
    const newStatus = currentStatus === "Active" ? "Archived" : "Active";
    try {
        await __TURBOPACK__imported__module__$5b$project$5d2f$my$2d$app$2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["prisma"].user.update({
            where: {
                id
            },
            data: {
                status: newStatus
            }
        });
        (0, __TURBOPACK__imported__module__$5b$project$5d2f$my$2d$app$2f$node_modules$2f$next$2f$cache$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["revalidatePath"])("/");
    } catch (error) {
        console.error("Status update failed:", error);
    }
}
;
(0, __TURBOPACK__imported__module__$5b$project$5d2f$my$2d$app$2f$node_modules$2f$next$2f$dist$2f$build$2f$webpack$2f$loaders$2f$next$2d$flight$2d$loader$2f$action$2d$validate$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["ensureServerEntryExports"])([
    addUser,
    deleteUser,
    toggleUserStatus
]);
(0, __TURBOPACK__imported__module__$5b$project$5d2f$my$2d$app$2f$node_modules$2f$next$2f$dist$2f$build$2f$webpack$2f$loaders$2f$next$2d$flight$2d$loader$2f$server$2d$reference$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["registerServerReference"])(addUser, "40af3c8cda59ee4269c3cba0dadfcce4c8d0d1ab92", null);
(0, __TURBOPACK__imported__module__$5b$project$5d2f$my$2d$app$2f$node_modules$2f$next$2f$dist$2f$build$2f$webpack$2f$loaders$2f$next$2d$flight$2d$loader$2f$server$2d$reference$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["registerServerReference"])(deleteUser, "40f7404565092e062b06cb5fb7cdfa515250fe5dff", null);
(0, __TURBOPACK__imported__module__$5b$project$5d2f$my$2d$app$2f$node_modules$2f$next$2f$dist$2f$build$2f$webpack$2f$loaders$2f$next$2d$flight$2d$loader$2f$server$2d$reference$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["registerServerReference"])(toggleUserStatus, "609fe819b94f41fd9521fdcee9985ed3dbf24ebcae", null);
}),
"[project]/my-app/.next-internal/server/app/page/actions.js { ACTIONS_MODULE0 => \"[project]/my-app/src/app/actions.ts [app-rsc] (ecmascript)\" } [app-rsc] (server actions loader, ecmascript) <locals>", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([]);
var __TURBOPACK__imported__module__$5b$project$5d2f$my$2d$app$2f$src$2f$app$2f$actions$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/my-app/src/app/actions.ts [app-rsc] (ecmascript)");
;
;
;
;
;
}),
"[project]/my-app/.next-internal/server/app/page/actions.js { ACTIONS_MODULE0 => \"[project]/my-app/src/app/actions.ts [app-rsc] (ecmascript)\" } [app-rsc] (server actions loader, ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "40af3c8cda59ee4269c3cba0dadfcce4c8d0d1ab92",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$my$2d$app$2f$src$2f$app$2f$actions$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["addUser"],
    "40f7404565092e062b06cb5fb7cdfa515250fe5dff",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$my$2d$app$2f$src$2f$app$2f$actions$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["deleteUser"],
    "609fe819b94f41fd9521fdcee9985ed3dbf24ebcae",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$my$2d$app$2f$src$2f$app$2f$actions$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["toggleUserStatus"]
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$my$2d$app$2f2e$next$2d$internal$2f$server$2f$app$2f$page$2f$actions$2e$js__$7b$__ACTIONS_MODULE0__$3d3e$__$225b$project$5d2f$my$2d$app$2f$src$2f$app$2f$actions$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$2922$__$7d$__$5b$app$2d$rsc$5d$__$28$server__actions__loader$2c$__ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i('[project]/my-app/.next-internal/server/app/page/actions.js { ACTIONS_MODULE0 => "[project]/my-app/src/app/actions.ts [app-rsc] (ecmascript)" } [app-rsc] (server actions loader, ecmascript) <locals>');
var __TURBOPACK__imported__module__$5b$project$5d2f$my$2d$app$2f$src$2f$app$2f$actions$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/my-app/src/app/actions.ts [app-rsc] (ecmascript)");
}),
];

//# sourceMappingURL=my-app_6d763517._.js.map