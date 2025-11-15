// import mongoose from "mongoose";
// import slug from "mongoose-slug-generator";

// mongoose.plugin(slug);

// const productSchema = new mongoose.Schema(
//   {
//     sku: {
//       type: String,
//       required: [true, "Please provide a sku"],
//       trim: true,
//       lowercase: true,
//     },
//     name: {
//       type: String,
//       required: [true, "Please provide a name"],
//       trim: true,
//     },
//     slug: {
//       type: String,
//       slug: ["name", "color"], // auto-generate from name + color
//       slug_padding_size: 4,
//       unique: true,
//     },
//     brand: {
//       type: String,
//       trim: true,
//       required: [true, "Please provide a brand"],
//     },
//     category: {
//       type: String,
//       lowercase: true,
//       trim: true,
//       required: [true, "Please provide a category"],
//     },
//     image: {
//       type: String,
//       trim: true,
//       required: [true, "Please provide an image"],
//     },
//     description: {
//       type: String,
//       trim: true,
//       required: [true, "Please provide a description"],
//     },
//     sizeQuantity: [
//       {
//         size: {
//           type: Number,
//           required: [true, "Please provide a size"],
//         },
//         quantity: {
//           type: Number,
//           required: [true, "Please provide a quantity for the size"],
//         },
//       },
//     ],
//     price: {
//       type: Number,
//       required: [true, "Please provide a price"],
//     },
//     color: {
//       type: String,
//       trim: true,
//       required: [true, "Please provide a color"],
//     },
//     material: {
//       type: String,
//       trim: true,
//     },
//     isActive: {
//       type: Boolean,
//       default: true,
//     },
//     isFeatured: {
//       type: Boolean,
//       default: false,
//     },
//     ratings: [
//       {
//         name: {
//           type: String,
//           default: "Anonymous",
//         },
//         rating: {
//           type: Number,
//         },
//         review: {
//           type: String,
//           trim: true,
//         },
//         date: {
//           type: Date,
//           default: Date.now,
//         },
//       },
//     ],
//     ratingScore: { type: Number, default: 0 },
//   },
//   { timestamps: true }
// );

// const Product = mongoose.model("Product", productSchema);

// export default Product;



import mongoose from "mongoose";
import slugify from "slugify";

const productSchema = new mongoose.Schema(
  {
    sku: {
      type: String,
      required: [true, "Please provide a sku"],
      trim: true,
      lowercase: true,
    },
    name: {
      type: String,
      required: [true, "Please provide a name"],
      trim: true,
    },
    slug: {
      type: String,
      unique: true,
      trim: true,
    },
    brand: {
      type: String,
      trim: true,
      required: [true, "Please provide a brand"],
    },
    category: {
      type: String,
      lowercase: true,
      trim: true,
      required: [true, "Please provide a category"],
    },
    image: {
      type: String,
      trim: true,
      required: [true, "Please provide an image"],
    },
    images: {
      type: [String],
      default: [],
    },
    description: {
      type: String,
      trim: true,
      required: [true, "Please provide a description"],
    },
    sizeQuantity: [
      {
        size: {
          type: Number,
          required: [true, "Please provide a size"],
        },
        quantity: {
          type: Number,
          required: [true, "Please provide a quantity for the size"],
        },
      },
    ],
    price: {
      type: Number,
      required: [true, "Please provide a price"],
    },
    color: {
      type: [String],
      default: [],
      required: [true, "Please provide at least one color"],
      validate: {
        validator: function(v) {
          return Array.isArray(v) && v.length > 0;
        },
        message: "At least one color is required"
      }
    },
    material: {
      type: String,
      trim: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    isFeatured: {
      type: Boolean,
      default: false,
    },
    ratings: [
      {
        name: { type: String, default: "Anonymous" },
        rating: { type: Number },
        review: { type: String, trim: true },
        date: { type: Date, default: Date.now },
      },
    ],
    ratingScore: { type: Number, default: 0 },
  },
  { timestamps: true }
);

// 👇 Automatically create slug from name + first color
productSchema.pre("save", function (next) {
  if (this.isModified("name") || this.isModified("color")) {
    // Use first color for slug generation, or join all colors if multiple
    const colorStr = Array.isArray(this.color) && this.color.length > 0
      ? this.color[0]
      : (typeof this.color === 'string' ? this.color : '');
    this.slug = slugify(`${this.name}-${colorStr}`, {
      lower: true,
      strict: true,
    });
  }
  next();
});

const Product = mongoose.model("Product", productSchema);

export default Product;
