import React, { useState } from "react";

const AddItemModal = ({ sale, onClose, onAdd, inventory, services }) => {
  if (!sale) return null;

  const [selectedTab, setSelectedTab] = useState("inventory");

  return (
    <div className="fixed inset-0 bg-black/40 dark:bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 px-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl p-6 sm:p-8 w-full max-w-3xl transition-all border border-gray-200 dark:border-gray-700">
        <h2 className="text-xl sm:text-2xl font-semibold mb-4 text-gray-900 dark:text-gray-100">
          Add Items or Services
        </h2>

        {/* Tabs */}
        <div className="flex mb-6 rounded-lg overflow-hidden border border-gray-300 dark:border-gray-700">
          <button
            className={`flex-1 py-2 font-medium transition-colors ${
              selectedTab === "inventory"
                ? "bg-blue-600 text-white"
                : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
            }`}
            onClick={() => setSelectedTab("inventory")}
          >
            Inventory
          </button>
          <button
            className={`flex-1 py-2 font-medium transition-colors ${
              selectedTab === "service"
                ? "bg-blue-600 text-white"
                : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
            }`}
            onClick={() => setSelectedTab("service")}
          >
            Services
          </button>
        </div>

        {/* Item/Service Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-h-96 overflow-y-auto pr-1">
          {selectedTab === "inventory"
            ? inventory.map((item) => (
                <div
                  key={item.id}
                  className="border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 rounded-xl p-4 shadow-sm flex flex-col justify-between hover:shadow-md transition-all"
                >
                  <div>
                    <h3 className="font-semibold text-gray-900 dark:text-gray-100">
                      {item.item_name}
                    </h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {item.item_classification}
                    </p>
                    <p className="font-bold mt-2 text-gray-900 dark:text-gray-100">
                      ₱{item.price}
                    </p>
                    <p
                      className={`text-sm mt-1 ${
                        item.stock === 0
                          ? "text-red-600 font-semibold"
                          : "text-gray-600 dark:text-gray-300"
                      }`}
                    >
                      Stock: {item.stock}
                    </p>
                  </div>

                  <button
                    className="mt-3 bg-blue-600 hover:bg-blue-700 text-white py-1.5 rounded-md transition-colors"
                    onClick={() => onAdd(sale, item, "inventory")}
                  >
                    Add
                  </button>
                </div>
              ))
            : services.map((service) => (
                <div
                  key={service.id}
                  className="border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 rounded-xl p-4 shadow-sm flex flex-col justify-between hover:shadow-md transition-all"
                >
                  <div>
                    <h3 className="font-semibold text-gray-900 dark:text-gray-100">
                      {service.service_name}
                    </h3>
                    <p className="font-bold mt-2 text-gray-900 dark:text-gray-100">
                      ₱{service.price}
                    </p>
                    {service.freebies?.length > 0 && (
                      <p className="text-sm text-green-600 dark:text-green-400 mt-1">
                        Includes: {service.freebies.join(", ")}
                      </p>
                    )}
                  </div>

                  <button
                    className="mt-3 bg-purple-600 hover:bg-purple-700 text-white py-1.5 rounded-md transition-colors"
                    onClick={() => onAdd(sale, service, "service")}
                  >
                    Add
                  </button>
                </div>
              ))}
        </div>

        {/* Close Button */}
        <div className="mt-6 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-md bg-gray-300 dark:bg-gray-700 text-gray-800 dark:text-gray-200 hover:bg-gray-400 dark:hover:bg-gray-600 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default AddItemModal;
