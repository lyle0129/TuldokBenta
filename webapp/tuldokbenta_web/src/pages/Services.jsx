// pages/Services.js
import { useEffect, useState } from "react";
import { useServices } from "../hooks/useServices";
import { useInventory } from "../hooks/useInventory";

const Services = () => {
  const {
    services,
    isLoading,
    loadServices,
    createService,
    updateService,
    deleteService,
  } = useServices();

  const { inventory, loadInventory } = useInventory();

  const [newService, setNewService] = useState({
    service_name: "",
    price: 0,
    freebies: [],
  });

  const [editingService, setEditingService] = useState(null);

  useEffect(() => {
    loadServices();
    loadInventory();
  }, [loadServices, loadInventory]);

  const handleCreate = async () => {
    if (!newService.service_name) return;
    await createService(newService);
    setNewService({ service_name: "", price: 0, freebies: [] });
  };

  const handleEditSave = async () => {
    if (!editingService) return;
    await updateService(editingService.id, editingService);
    setEditingService(null);
  };

  // Unique classifications from inventory
  const classifications = [
    ...new Set(inventory.map((item) => item.item_classification)),
  ];

  const toggleFreebie = (serviceObj, classification) => {
    const alreadySelected = serviceObj.freebies.includes(classification);
    const updated = alreadySelected
      ? serviceObj.freebies.filter((c) => c !== classification)
      : [...serviceObj.freebies, classification];

    return { ...serviceObj, freebies: updated };
  };

  return (
    <div className="max-w-6xl mx-auto mt-10 p-6">
      <h1 className="text-3xl font-bold mb-6">Services</h1>

      {/* Add Service */}
      <div className="bg-white shadow rounded-lg p-6 mb-8">
        <h2 className="text-lg font-semibold mb-4">Add New Service</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium mb-1">Service Name</label>
            <input
              type="text"
              placeholder="Service Name"
              value={newService.service_name}
              onChange={(e) =>
                setNewService({ ...newService, service_name: e.target.value })
              }
              className="w-full border rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Price</label>
            <input
              type="number"
              placeholder="Price"
              value={newService.price}
              onChange={(e) =>
                setNewService({ ...newService, price: +e.target.value })
              }
              className="w-full border rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">Freebies Included</label>
          <div className="flex flex-wrap gap-4">
            {classifications.map((cls) => (
              <label
                key={cls}
                className="flex items-center space-x-2 text-sm bg-gray-100 px-3 py-1 rounded-md"
              >
                <input
                  type="checkbox"
                  checked={newService.freebies.includes(cls)}
                  onChange={() => setNewService(toggleFreebie(newService, cls))}
                  className="accent-blue-600"
                />
                <span>{cls}</span>
              </label>
            ))}
          </div>
        </div>

        <button
          onClick={handleCreate}
          className="mt-6 bg-blue-600 text-white px-6 py-2 rounded-md hover:bg-blue-700 transition"
        >
          Add Service
        </button>
      </div>

      {/* Services List */}
      {isLoading ? (
        <p>Loading...</p>
      ) : (
        <div className="overflow-x-auto bg-white shadow rounded-lg">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-gray-100 text-left text-sm font-medium">
                <th className="p-3 border">Name</th>
                <th className="p-3 border">Price</th>
                <th className="p-3 border">Freebies</th>
                <th className="p-3 border text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {services.map((service, idx) => (
                <tr
                  key={service.id}
                  className={`${
                    idx % 2 === 0 ? "bg-white" : "bg-gray-50"
                  } hover:bg-gray-100`}
                >
                  <td className="p-3 border">{service.service_name}</td>
                  <td className="p-3 border">${service.price}</td>
                  <td className="p-3 border">
                    {service.freebies?.length > 0
                      ? service.freebies.join(", ")
                      : "-"}
                  </td>
                  <td className="p-3 border text-center space-x-2">
                    <button
                      onClick={() => setEditingService(service)}
                      className="bg-yellow-500 text-white px-3 py-1 rounded-md hover:bg-yellow-600"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => deleteService(service.id)}
                      className="bg-red-500 text-white px-3 py-1 rounded-md hover:bg-red-600"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
              {services.length === 0 && (
                <tr>
                  <td
                    colSpan="4"
                    className="text-center p-6 text-gray-500 italic"
                  >
                    No services found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Edit Modal */}
      {editingService && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-md">
            <h2 className="text-xl font-semibold mb-4">Edit Service</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">
                  Service Name
                </label>
                <input
                  type="text"
                  value={editingService.service_name}
                  onChange={(e) =>
                    setEditingService({
                      ...editingService,
                      service_name: e.target.value,
                    })
                  }
                  className="w-full border px-3 py-2 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Price</label>
                <input
                  type="number"
                  value={editingService.price}
                  onChange={(e) =>
                    setEditingService({
                      ...editingService,
                      price: +e.target.value,
                    })
                  }
                  className="w-full border px-3 py-2 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Freebies checkboxes in edit */}
              <div>
                <label className="block text-sm font-medium mb-2">
                  Freebies Included
                </label>
                <div className="flex flex-wrap gap-3">
                  {classifications.map((cls) => (
                    <label
                      key={cls}
                      className="flex items-center space-x-2 text-sm bg-gray-100 px-3 py-1 rounded-md"
                    >
                      <input
                        type="checkbox"
                        checked={editingService.freebies?.includes(cls)}
                        onChange={() =>
                          setEditingService(toggleFreebie(editingService, cls))
                        }
                        className="accent-blue-600"
                      />
                      <span>{cls}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex justify-end space-x-3 mt-6">
              <button
                onClick={() => setEditingService(null)}
                className="px-5 py-2 bg-gray-300 rounded-md hover:bg-gray-400"
              >
                Cancel
              </button>
              <button
                onClick={handleEditSave}
                className="px-5 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Services;
